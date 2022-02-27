#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import sys
import json
import logging
import traceback
from os import path
from glob import glob
import shutil
import fix_util as fix
from tornado import ioloop, gen
from tornado.web import Application, RequestHandler
from tornado.options import define, options
from tornado.escape import to_basestring, json_decode
from tornado.httpclient import AsyncHTTPClient
from tornado.httpclient import HTTPError

THIS_PATH = path.abspath(path.dirname(__file__))
BASE_DIR = path.dirname(THIS_PATH)
DATA_DIR = path.join(THIS_PATH, 'data')
pat_note_inv = re.compile(r'^-|[　\s\n]|\d{4}\w*$')

define('port', default=8003, help='run port', type=int)
define('debug', default=True, help='the debug mode', type=bool)


class CbBaseHandler(RequestHandler):
    def on_error(self, e):
        if isinstance(e, AssertionError):
            _, _, tb = sys.exc_info()
            # traceback.print_tb(tb)  # Fixed format
            tb_info = traceback.extract_tb(tb)
            filename, line, func, text = tb_info[-1]
            logging.error('{0} {1}, in {2}: {3}'.format(path.basename(filename), line, func, str(e)))
        else:
            traceback.print_exc()
        self.send_error(500, reason=str(e))

    @staticmethod
    def load_page(page_id):
        filename = path.join(DATA_DIR, page_id + '.json')
        html_file = path.join(DATA_DIR, page_id + '.html')
        assert path.exists(filename), 'page {} not exists'.format(page_id)
        with open(filename) as f:
            page = json.load(f)
        if not page.get('html_end') and path.exists(html_file):
            with open(html_file) as f:
                page['html_end'] = f.read().split('\n')
        return page

    @staticmethod
    def save_page(page, save_html=False):
        filename = path.join(DATA_DIR, '{}.json'.format(page['info']['id']))
        html_file = path.join(DATA_DIR, '{}.html'.format(page['info']['id']))
        html = page.get('html_end')
        if html and save_html:
            page['info']['note_count'] = len([1 for r in (html or []) if 'note-tag' in r])
            with open(html_file, 'w') as f:
                f.write('\n'.join(html))
        with open(filename, 'w') as f:
            page.pop('html_end', 0)
            json.dump(page, f, ensure_ascii=False, indent=2, sort_keys=True)
        page['html_end'] = html

    @staticmethod
    def reset_html(page):
        page['html'] = []
        for a in page['html_org']:
            page['html'].extend(a)

    @staticmethod
    def extract_commentary(html):
        """从注解网页中提取段落中的原文与注解"""
        if 'div-commentary' not in html and len(re.findall(r'<p .+?</span>[^　]{2,60}　.{10,999}</p>', html)) > 5:
            pat = "<span class='div-orig'>%s</span>", "<span class='div-commentary'>%s</span>"
            rows = [re.sub(r'<p .+?</span>([^　]+)　(.+?)</p>',
                           lambda m: m.group().replace(m.group(1), pat[0] % m.group(1), 1)
                           .replace(m.group(2), pat[1] % m.group(2)), t) for t in html.split('\n')]
            return '\n'.join(rows).replace('div.div-orig', '.div-orig')
        return html

    @gen.coroutine
    def fetch_cb(self, name):
        cache_file = path.join(DATA_DIR, 'cache', name + '.html')
        if path.exists(cache_file):
            return open(cache_file).read()

        url = 'https://api.cbetaonline.cn/download/html/{}.html'.format(name if '_' in name else name + '_001')
        client = AsyncHTTPClient()
        try:
            r = yield client.fetch(url, connect_timeout=30, request_timeout=30)
            if r.error:
                return self.send_error(504, reason='fail to fetch {0}: {1}'.format(url, str(r.error)))

            html = self.extract_commentary(to_basestring(r.body))
            with open(cache_file, 'w') as f:
                f.write(html)
            return html
        except HTTPError as e:
            return self.send_error(504, reason='fail to fetch {0}: {1}'.format(url, str(e)))

    @staticmethod
    def find_html_index(rows, pid):
        rex = re.compile(r"<(p|div) id=['\"]{0}['\"]".format(pid))
        for (i, s) in enumerate(rows):
            if rex.search(s):
                return i, rex
        return -1, rex

    @staticmethod
    def _find_index(html, index, li, log, page, pid):
        ri, rex = CbBaseHandler.find_html_index(html[index: index + 1], pid)
        if ri < 0:
            ri = CbBaseHandler.find_html_index(html, pid)[0]
            if ri < 0:
                logging.warning('{0} not at index {1}: {2}'.format(pid, index, log))
                return ri
            logging.info('{0} {1} {2} --> {3}'.format(li, pid, index, ri))
            page['log'][li] = re.sub(r'at (\d+)', 'at {}'.format(ri), log)
            index = ri
        return index

    @staticmethod
    def rollback(page):
        CbBaseHandler.reset_html(page)
        if page.get('html_org') and page.get('log'):
            id_map = {}
            html = page['html']
            for (li, log) in enumerate(page['log']):
                m = re.search(r'^Split paragraph #(p\d+\w*) at (\d+)( as result #[^:]+)?: (.+@.*)$', log)
                if m:
                    pid, new_ids, text = m.group(1), m.group(3), m.group(4)
                    index = CbBaseHandler._find_index(html, int(m.group(2)), li, log, page, pid)
                    if index >= 0:
                        CbBaseHandler._split_p_in_rollback(id_map, index, new_ids, page, pid, text)
                elif re.match(r'^Split paragraph', log):
                    logging.warning('invalid log: ' + log)

                m = not m and re.search(r'^Merge paragraph #(p\d+\w*) with #(p\d+\w*) at (\d+)(: .+)?$', log)
                if m:
                    pid, id2, text = m.group(1), m.group(2), m.group(4)
                    index = CbBaseHandler._find_index(html, int(m.group(3)), li, log, page, pid)
                    if index >= 0:
                        SplitParagraphHandler.merge_p(index, page, pid, id2)
                elif re.match(r'^Merge paragraph', log):
                    logging.warning('invalid log: ' + log)
            return True

    @staticmethod
    def _split_p_in_rollback(ids, index, new_ids, page, pid, text):
        new_ids = new_ids and new_ids.split('#')[1].split(',')
        bid = re.sub(r'\d[a-z].*$', lambda _: _.group(0)[0], pid)
        texts = text.split('@')
        r = [{'text': texts[0]}]
        for (i, text) in enumerate(texts[1:]):
            if new_ids:
                r.append({'id': new_ids[i], 'text': text})
            else:
                ids[bid] = ids.get(bid, -1) + 1
                assert ids[bid] < 26 * 9, 'id out of range'
                char = chr(ord('a') + ids[bid] % 26) + ('' if ids[bid] < 26 else chr(ord('0') + ids[bid] // 26))
                r.append({'id': bid + char, 'text': text})
                logging.info('split paragraph from #{0} as #{1}: {2}'.format(pid, r[-1]['id'], text[0:20]))
        SplitParagraphHandler.split_p(index, r, page)


class CbHomeHandler(CbBaseHandler):
    URL = '/cb'

    def get(self):
        """原典首页"""
        try:
            for fn in glob(path.join(THIS_PATH, 'example', '*.json')):
                if not path.exists(path.join(DATA_DIR, path.basename(fn))):
                    shutil.copy(fn, DATA_DIR)

            files = sorted(glob(path.join(DATA_DIR, '*.json')))
            pages = [json.load(open(fn)) for fn in files]
            self.render('cb_home.html', pages=[(p['info'], dict(
                id=p['info']['id'], url='/cb/page/' + p['info']['id'],
                ke_pan_type_count=len([1 for r in p.get('rowPairs', []) if re.match(r'^:ke-type \d [^\s]+', r)])
                                  or (1 if [1 for s in p.get('html', []) if '<div ke-pan=' in s] or
                                           [1 for r in p.get('rowPairs', []) if re.match(r':ke', r)] else 0)
            )) for p in pages])

        except Exception as e:
            self.on_error(e)


class PageNewHandler(CbBaseHandler):
    URL = '/cb/page/new'

    def post(self):
        """创建原典页面"""
        try:
            page_id = to_basestring(self.get_argument('id', ''))
            caption = to_basestring(self.get_argument('caption', '')).strip()
            if not re.match(r'^[A-Za-z0-9_]{2,8}$', page_id):
                return self.send_error(501, reason='invalid id')
            if not caption or len(caption) > 20:
                return self.send_error(502, reason='invalid caption')

            filename = path.join(DATA_DIR, page_id + '.json')
            if path.exists(filename):
                return self.send_error(503, reason='file exists')

            self.save_page({'info': dict(id=page_id, caption=caption), 'log': []})
            self.write({'url': '/cb/page/' + page_id})
        except Exception as e:
            self.on_error(e)


class PageHandler(CbBaseHandler):
    URL = r'/cb/page/([\w_]+)'

    def get(self, page_id):
        """显示原典页面"""
        try:
            page = self.load_page(page_id)
            info = page['info']
            step = int(self.get_argument('step', 0))
            if step > 0:
                info['step'] = step - 1
                self.save_page(page)
                return self.redirect('/cb/page/' + page_id)

            step = info.get('step', 0)
            if step > 1:  # 完成制作，或后续步骤
                if page.get('html_end'):
                    page['html'] = page['html_end'][:]
                else:
                    step = 1  # 段落分组
            if step > 0 and not page.get('html'):
                step = 0

            name = page_id.split('_')[0]
            juan = int((page_id.split('_')[1:] or [1])[0])
            cb_ids = info.get('cb_ids') or '{0}_{1:0>3d}'.format(name, juan)
            has_ke_pan = bool(step and (re.search(r':ke\d? ', ''.join(page.get('rowPairs', []))) or
                                        [1 for s in page['html'] if '<div ke-pan=' in s]))
            ke_pan_types = step and [r[len(':ke-type '):] + ' ' for r in page.get('rowPairs', [])
                                     if re.match(r'^:ke-type \d [^\s]+', r)] or []  # 'num name desc'
            note_tags = [s.split('|')[1] for s in info.get('notes', [])]

            if self.get_argument('export', 0):
                json_files = ['{0}-{1}.json.js'.format(page_id, re.sub('_.+$', '', v['name']))
                              for tag, v in (page.get('notes') or {}).items()]
                note_names = [['{0}Notes'.format(re.sub('_.+$', '', v['name'])),
                               v.get('col', 0), v.get('desc', v['name']), tag]
                              for tag, v in (page.get('notes') or {}).items()]
                html = self.render_string('cb_export.html', page=page, info=info, id=page_id,
                                          json_files=json_files, note_names=note_names,
                                          has_ke_pan=has_ke_pan, ke_pan_types=ke_pan_types)
                return self.write(dict(html=to_basestring(html)))

            self.render('cb_page.html', page=page, info=info, step=step, id=page_id,
                        has_ke_pan=has_ke_pan, ke_pan_types=ke_pan_types,
                        rowPairs='||'.join(page.get('rowPairs', [])),
                        paragraph_ids=','.join(ParagraphOrderHandler.get_ids(page)),
                        notes=[(tag, page['notes'][tag]) for tag in note_tags if tag in page.get('notes', {})],
                        cb_ids=cb_ids)
        except Exception as e:
            self.on_error(e)

    def post(self, page_id):
        """保存网页内容"""
        try:
            page = self.load_page(page_id)
            html = to_basestring(self.get_argument('html', '')).strip()
            step = int(self.get_argument('step', page['info']['step']))
            field = 'html_end' if step > 1 and page.get('html_end') else 'html'
            changed = re.search('<p id', html) and html != '\n'.join(page[field])

            if changed:
                logging.info('save html')
                page[field] = html.split('\n')
                self.save_page(page, field == 'html_end')
            self.write(dict(changed=bool(changed)))
        except Exception as e:
            self.on_error(e)


class HtmlDownloadHandler(CbBaseHandler):
    URL = r'/cb/page/fetch/([\w_]+)'

    @gen.coroutine
    def post(self, page_id):
        """从CBeta获取原文HTML"""
        try:
            page = self.load_page(page_id)
            cb_ids = to_basestring(self.get_argument('urls', '')) or page['info']['cb_ids']
            force = self.get_argument('reset', 0)

            urls = cb_ids.split('|') if cb_ids else []
            if not force and urls and cb_ids == page['info'].get('cb_ids') and page.get('html_org'):
                page['info']['step'] = 1
            else:
                content = []
                for col in urls:
                    html = None
                    name_desc = re.split(r'\s+', col.strip())
                    col, desc = name_desc[0].split('_'), len(name_desc) > 1 and ' ' + name_desc[-1] or ''
                    jin = col[0]
                    for juan in (col[1:] or ['']):
                        name = jin + ('_' + juan if juan else '')
                        r = yield self.fetch_cb(name)
                        if not r:
                            return
                        if len(name_desc[0].split('_')) > 2:
                            name = name.split('_')[0]
                        html = fix.convert_cb_html(html, r, name + desc)
                    if html:
                        content.append(html)

                if not content or len(content) > 12:
                    return self.send_error(505, reason='only support 1~12 columns')

                page['info'].update(dict(step=1, cols=len(content), cb_ids=cb_ids))
                fix.merge_cb_html(content)
                page['html_org'] = [html.split('\n') for html in content]

            self.rollback(page)
            self.save_page(page)
            self.write({})
            self.finish()
        except Exception as e:
            self.on_error(e)


class RowPairsHandler(CbBaseHandler):
    URL = r'/cb/page/pairs/([\w_]+)'

    def post(self, page_id):
        """保存段落分组及科判条目数据"""
        try:
            pairs = self.get_argument('pairs').split('||')
            ke_type = self.get_argument('kePanType', '1')
            page = self.load_page(page_id)
            rows = page['html']
            ret = False

            if len(pairs) == 1 and re.match('^:ke-(add|del|set) ', pairs[0]):
                m = re.search(r':ke-(add|append|set) ([pg]\d[a-z0-9_-]*|ke\d+) (.+)$', pairs[0])
                if m:
                    op, pid, text = m.group(1), m.group(2), m.group(3)
                    text = re.sub('[><\'"]', '', text)
                    if op == 'set':
                        index = self.find_ke_pan_index(rows, pid)
                        if index >= 0:
                            rows[index] = re.sub(r'data-indent=[\'"]\w*[\'"]', "data-indent='{}'".format(
                                len(re.sub('[^-].*$', '', text))), rows[index])
                            rows[index] = re.sub(r'>.*<', '>' + re.sub('^-*', '', text) + '<', rows[index])
                            ret = True
                    else:
                        if pid.startswith('ke'):  # 在一个科判前加科判
                            index = self.find_ke_pan_index(rows, pid)
                        else:  # 在一个段落前加科判
                            index = self.find_html_index(rows, pid)[0]
                        t = "<div ke-pan='0' data-ke-type=='{0}' class='ke-line' data-indent='{1}'>{2}</div>".format(
                            ke_type, len(re.sub('[^-].*$', '', text)), re.sub('^-*', '', text))
                        if index >= 0:
                            ret = True
                            rows.insert(index + 1 if op == 'append' else index, t)

                m = not m and re.search(r':ke-del (ke[0-9]+)$', pairs[0])
                if m:
                    index = self.find_ke_pan_index(rows, m.group(1))
                    if index >= 0:
                        ret = True
                        del rows[index]

                self.fill_ke(rows)
            else:
                ret = True
                page['rowPairs'] = pairs
            if ret:
                self.save_page(page)
            self.write(dict(success=ret))
        except Exception as e:
            self.on_error(e)

    @staticmethod
    def find_ke_pan_index(rows, ke_pan):
        ke = re.compile('ke-pan=[\'"]{}[\'"]'.format(ke_pan))
        a = [i for (i, t) in enumerate(rows) if ke.search(t)]
        return a[0] if a else -1

    @staticmethod
    def fill_ke(rows):
        kid = 0
        for (i, r) in enumerate(rows):
            if '<div ke-pan=' in r and 'ke-line' in r:
                last = i > 0 and 'ke-line' in rows[i - 1]
                kid += 1
                r = re.sub(r'ke-pan=[\'"]\w*[\'"]', "ke-pan='{}'".format(kid), r)
                r = re.sub(r'class=[\'"][\w -]*[\'"]', "class='ke-line{}'".format('' if last else ' first-ke'), r)
                rows[i] = r
                if last:
                    rows[i - 1] = re.sub(r'class=[\'"][\w -]*[\'"]',
                                         lambda m: m.group()[:-1] + ' has-next-ke' + m.group()[-1], rows[i - 1])


class ParagraphOrderHandler(CbBaseHandler):
    URL = r'/cb/page/p/order/([\w_]+)'

    def get(self, page_id):
        """获取所有段落编号"""
        try:
            page = self.load_page(page_id)
            self.write(dict(ids=self.get_ids(page)))
        except Exception as e:
            self.on_error(e)

    @staticmethod
    def get_ids(page):
        return [re.search(r"id='([pg]\d[a-z0-9_-]*)'", p).group(1) for p in page.get('html', [])
                if re.search(r"id='([pg]\d[a-z0-9_-]*)'", p)]


class SplitParagraphHandler(CbBaseHandler):
    URL = r'/cb/page/p/split/([\w_]+)'

    def post(self, page_id):
        """保存段落拆分或合并的信息"""
        try:
            data = json_decode(self.get_argument('data'))
            result = data.get('result')
            id1, id2 = data.get('id'), data.get('id2')
            page = self.load_page(page_id)
            assert id1 and re.match(r'p\d', id1), 'need id'

            index, log, new_ids = -1, None, []
            for (i, text) in enumerate(page['html']):
                prefix = "<p id='{}'".format(id1)
                if prefix in text:
                    index = i  # 文本行序号
                    if not result:
                        assert "<p id='{}'".format(data.get('id2')) in page['html'][i + 1], 'fail to merge'
                        log = 'Merge paragraph #{0} with #{1} at {2}: {3}'.format(
                            id1, id2, i, re.sub('^<p[^>]+>|</p>', '', page['html'][i + 1][:20]))
                        logging.info(log)
                        self.merge_p(i, page, id1, id2)
                    else:
                        new_ids = [r['id'] for r in result[1:]]
                        log = 'Split paragraph #{0} at {1} as result #{2}: {3}'.format(
                            id1, i, ','.join(new_ids), data['text'])
                        logging.info(log)
                        assert text.index(prefix) == 0
                        self.split_p(i, result, page)
                    break

            assert index >= 0, 'html not found'
            page['log'].append(log)
            ret = dict(index=index, id=id1)
            if data.get('merged'):  # 在已合并区域，就更新段落分组数据
                pairs = page['rowPairs']
                pat = re.compile('(^|[ |])' + id1 + '([ |]|$)' if result else id1 + r'\s+' + id2)
                idx = [i for (i, r) in enumerate(pairs) if pat.search(r)]
                assert idx, 'not in rowPairs'
                pairs[idx[0]] = pat.sub(lambda m: id1 if not result else m.group().replace(
                    id1, ' '.join([id1] + new_ids)), pairs[idx[0]])
                ret['rowPairs'] = '||'.join(pairs)

            self.save_page(page)
            self.write(ret)
        except Exception as e:
            self.on_error(e)

    @staticmethod
    def split_p(i, result, page):
        if 0 <= i < len(page['html']):
            page['html'][i] = re.sub(r'>.+</p>', '>{}</p>'.format(result[0]['text']), page['html'][i])
            for j in range(len(result) - 1, 0, -1):
                page['html'].insert(i + 1, "<p id='{0}'>{1}</p>".format(result[j]['id'], result[j]['text']))

    @staticmethod
    def merge_p(i, page, id1, id2):
        if i + 1 < len(page['html']) and "<p id='{}'".format(id1) in page['html'][i] and\
                "<p id='{}'".format(id2) in page['html'][i + 1]:
            page['html'][i] = page['html'][i].replace('</p>', re.sub('^<p[^>]+>', '', page['html'][i + 1]))
            del page['html'][i + 1]


class EndMergeHandler(CbBaseHandler):
    URL = r'/cb/page/merge/end/([\w_]+)'

    def post(self, page_id):
        """段落分组完成"""
        try:
            html = self.get_argument('html', '').strip()
            page = self.load_page(page_id)
            old_html = page.get('html_end', [])
            html_end = page['html_end'] = html.split('\n') if html else page['html']
            page['info'].update(step=2)

            r_note = re.compile(r'<note|note-tag|data-nid')
            re_p = re.compile(r"^\s*<(p|div) id=['\"]([\w-]+)['\"]")
            update_count, miss_ids = 0, []
            for (i, html) in enumerate(old_html):
                if r_note.search(html):
                    r = re_p.search(html)
                    pid, tag = r and r.group(2) or str(i), r and r.group(1)
                    if r and html.endswith('</{}>'.format(tag)):
                        idx = self.find_html_index(html_end, pid)[0]
                        if idx >= 0 and re.match(r"^\s*<{0} id=['\"]{1}['\"].+</{0}>$".format(tag, pid), html_end[idx]):
                            html_end[idx] = html
                            update_count += 1
                            continue
                    miss_ids.append(pid)
                    logging.info('miss {0}: {1}'.format(pid, html))

            if not self.get_argument('test', ''):
                logging.info('end merge {0}: update={1}, miss={2}'.format(page_id, update_count, miss_ids))
                self.save_page(page, True)
            self.write(dict(update_count=update_count, miss_count=len(miss_ids), miss_ids=','.join(miss_ids)[:60]))
        except Exception as e:
            self.on_error(e)


class FetchHtmlHandler(CbBaseHandler):
    URL = r'/cb/html/([\w_]+)'

    @gen.coroutine
    def get(self, name):
        """从CBeta获取原文HTML"""
        parts, content = name.split('_'), []
        try:
            if len(parts) == 1:
                html = yield self.fetch_cb(name)
                if html:
                    content.append(html)
            else:
                for juan in parts[1:]:
                    name = parts[0] + '_' + juan
                    html = yield self.fetch_cb(name)
                    if html:
                        content.append(html)

            if not self._finished:
                self.write(dict(html='\n'.join(content)))
                self.finish()
        except Exception as e:
            self.on_error(e)


class PageNoteHandler(CbBaseHandler):
    URL = r'/cb/page/note/([\w_]+)'

    def get(self, page_id):
        """获取注解数据"""
        try:
            tag = self.get_argument('tag')
            page = self.load_page(page_id)
            notes = page.get('notes', {}).get(tag, {})
            self.write(notes)
        except Exception as e:
            self.on_error(e)

    def post(self, page_id):
        """保存注解数据"""
        try:
            tag = to_basestring(self.get_argument('tag'))
            nid = int(self.get_argument('nid', 0))

            page = self.load_page(page_id)
            page['notes'] = page.get('notes', {})

            if nid and self.get_argument('remove', None) is not None:
                return self.link_note(page, tag, nid)

            if nid and self.get_argument('split', 0):
                return self.split_note(self, page, tag, nid, to_basestring(self.get_argument('split')))

            if self.get_argument('ignore', 0):
                return self.ignore_note(page, tag)

            self.add_notes(page, tag)
        except Exception as e:
            self.on_error(e)

    @staticmethod
    def find_note(notes, line_no, text):
        for (i, t) in enumerate(notes or []):
            for j in range(int(len(t) / 3)):
                if (not line_no or line_no == t[j * 3 + 1]) and pat_note_inv.sub('', t[j * 3 + 2]) == text:
                    return i, j, t[j * 3: j * 3 + 3]

    @staticmethod
    def get_ids_by_line(notes, line_no):
        ids = []
        for (i, t) in enumerate(notes or []):
            for j in range(int(len(t) / 3)):
                if line_no == t[j * 3 + 1]:
                    ids.append(t[j * 3])
        return ids

    def add_notes(self, page, tag):
        name = to_basestring(self.get_argument('name', ''))
        desc = to_basestring(self.get_argument('desc', ''))
        col = int(self.get_argument('col', 0) or 0)
        reset = self.get_argument('reset', '')
        lines = json_decode(self.get_argument('lines'))

        assert reset or tag not in page['notes'], 'tag exists'
        notes, raw, orig = [], [], ''
        split_count = [0, 0]
        new_item = dict(tag=tag, name=name, desc=desc, col=col, notes=notes)

        if reset.startswith('0'):
            new_id = 0
            page['old_notes'] = page.get('old_notes', {}) or json.loads(json.dumps(page['notes']))
        else:
            new_id = page['info'].get('note_id', 0)

        for r in lines:
            if not r.get('text') or '【經文資訊】' in r['text']:
                continue
            if r.get('raw'):
                new_id += 1
                raw.append([new_id, r.get('line', ''), r['text']])
            elif r.get('orig') == '1':
                orig = r['text']
            elif r.get('orig') == '0':
                if not orig:
                    logging.warning('ignore comment: ' + r['text'])
                    continue
                new_id += 1
                notes.append([new_id, orig, r['text'] + r.get('line', '')])
                orig = None

        if notes or raw:
            if not reset and tag not in page['notes']:
                page['info']['notes'] = page['info'].get('notes', []) + ['|'.join([str(col), tag, name, desc])]
            if raw:
                new_item.update(raw=raw, notes=notes)

            new_id = int((new_id + 19) / 10) * 10
            page['info']['note_id'] = new_id
            page['notes'][tag] = new_item
            logging.info('{0}: add {1}+{2} notes'.format(tag, len(notes), len(raw)))

            for (li, log) in enumerate(reset and page['log'] or []):
                m = re.search(r'^Split note #(\d+) at (\w+) of {0} with #([\d,]+): (.+@.*)$'.format(tag), log)
                if m:
                    nid, new_ids, line_no, text = m.group(1), m.group(3), m.group(2), m.group(4)
                    nid, new_ids = int(nid), [int(t) for t in new_ids.split(',')]
                    r = PageNoteHandler.find_note(raw, None, text.replace('@', ''))
                    if not r:
                        logging.warning('{0} {1} not found: {2}'.format(nid, line_no, text))
                        continue
                    i, j, note = r
                    res = dict(new_ids=new_ids)
                    PageNoteHandler.split_note(None, page, tag, raw[i][j * 3], text, res)
                    if res.get('log'):
                        page['log'][li] = res['log']
                        split_count[0] += 1
                        split_count[1] += len(res['new_ids'])
                    else:
                        logging.warning('not found: ' + log)
            if split_count[0]:
                logging.info('{0}: split {1} notes, {2} added'.format(tag, split_count[0], split_count[1]))
                new_id = int((new_id + 19) / 10) * 10

        if 'end' in reset and page['old_notes']:
            self.apply_notes(page)

        CbBaseHandler.save_page(page)
        self.write(dict(tag=tag, count=len(raw or notes), split=split_count[1]))

    def apply_notes(self, page):
        old_notes = page.get('old_notes')
        for tag, v in page['notes'].items():
            tmp_r, tmp_s = v.get('raw', []), v['notes']
            tmp_ts = tmp_r or tmp_s
            tmp_ids = [r[0] for r in tmp_ts]
            texts1 = [t[1] + pat_note_inv.sub('', t[2]) for t in tmp_ts]
            texts2 = [pat_note_inv.sub('', t[1]) + pat_note_inv.sub('', t[2]) for t in tmp_ts]
            assert (tmp_r and not tmp_s) or (not tmp_r and tmp_s)
            assert not [r for r in tmp_ts if len(r) != 3]

            old_rs = old_notes.get(tag, {})
            old_r, old_s = old_rs.get('raw', []), old_rs.get('notes', [])
            old_ids, old_ts = [], []
            old_rs = [r for r in (old_r or old_s) if '【經文資訊】' not in r[2]]
            for (i, r) in enumerate(old_rs):
                for j in range(int(len(r) / 3)):
                    old_ids.append(r[j * 3])
                    old_ts.append(r[j * 3: j * 3 + 3] + [i, j * 3])

            old2new, new2old = {}, {}
            print([t[2] for t in tmp_ts])
            for (i, old_t) in enumerate(old_ts):
                text = old_t[1] + pat_note_inv.sub('', old_t[2])
                if text in texts1:
                    tmp_t = tmp_ts[texts1.index(text)]
                else:
                    text = pat_note_inv.sub('', old_t[1]) + pat_note_inv.sub('', old_t[2])
                    if text in texts2:
                        tmp_t = tmp_ts[texts2.index(text)]
                    else:
                        assert 0, 'old note {0} not in new notes: {1}'.format(old_t[0], text)

                assert old_t[0] not in old2new, '{0} in old2new: {1}'.format(old_t[0], text)
                assert tmp_t[0] not in new2old, '{0} in new2old: {1}'.format(tmp_t[0], text)
                old2new[old_t[0]] = tmp_t
                new2old[tmp_t[0]] = old_t

            free_ids = list(set(tmp_ids) - set(list(old2new.keys())))
            new_notes, notes_added, last_t = old_rs[:], [], None
            for tmp_t in tmp_ts:
                if tmp_t[0] in new2old:
                    old_t = new2old[tmp_t[0]]
                    old_orig = old_rs[old_t[3]]
                    old_orig[old_t[4] + 1] = old_t[1] = tmp_t[1]
                    old_orig[old_t[4] + 2] = old_t[2] = tmp_t[2] = ('-' if old_t[2][0] == '-' else '') + tmp_t[2]
                    last_t = old_orig
                else:
                    tmp_t[0] = free_ids.pop(0)
                    if last_t:
                        new_notes.insert(new_notes.index(last_t) + 1, tmp_t)
                    else:
                        notes_added.append(tmp_t)
            new_notes = notes_added + new_notes

            if old_r and old_s:
                for (i, r) in enumerate(old_s):
                    for j in range(int(len(r) / 3)):
                        new_t = old2new[r[j * 3]]
                        r[j * 3 + 1] = new_t[1]
                        r[j * 3 + 2] = new_t[2]

            if old_r:
                v['raw'] = new_notes
                v['notes'] = old_s
            else:
                assert 'raw' not in v
                v['notes'] = new_notes
        page.pop('old_notes')

    @staticmethod
    def split_note(self, page, tag, nid, split, res=None):
        split = split.split('@')
        item = page['notes'].get(tag)
        assert item, 'tag not exists'
        raw = item['raw']
        upd = [(i, r) for (i, r) in enumerate(raw) if r[0] == nid]
        assert len(upd) == 1, 'raw {0} not exists: {1}'.format(nid, json.dumps(upd, ensure_ascii=False))
        index, upd = upd[0]
        assert len(upd) == 3, 'raw {0} not simple parameter'.format(nid)
        if not split[0] or pat_note_inv.sub('', upd[2]) != pat_note_inv.sub('', ''.join(split)):
            logging.warning('{0} text mismatch: {1} != {2}'.format(nid, upd[2], ''.join(split)))
            assert 0, '{0} text mismatch'.format(nid)

        upd[2] = split[0]
        for (i, r) in enumerate(item['notes']):
            if r[0] == upd[0]:
                r[2] = upd[2]
                break
        new_ids = []
        new_id = page['info'].get('note_id', 0)
        for (i, text) in enumerate(split[1:]):
            new_id += 1
            r = [new_id, upd[1], text]
            raw.insert(index + i + 1, r)
            new_ids.append(str(new_id))

        page['info']['note_id'] = new_id
        log = 'Split note #{0} at {1} of {2} with #{3}: {4}'.format(
            nid, upd[1], tag, ','.join(new_ids), '@'.join(split))
        if res:
            res.update(dict(log=log, new_ids=new_ids))
        elif self:
            if item.get('log', 1):
                page['log'].append(log)
            self.save_page(page)
            self.write(dict(ids=','.join(new_ids), raw=raw))

    def link_note(self, page, tag, nid):
        ids = [int(r) for r in self.get_argument('remove').split(',') if r]
        item = page['notes'].get(tag)
        assert item, 'tag not exists'
        raw = item.get('raw', item['notes'])
        upd = [r for r in raw if r[0] == nid]
        assert len(upd) == 1, 'note {0} not exists'.format(nid)
        assert nid not in ids, 'invalid ids'

        [upd[0].extend(r) for r in raw if r[0] in ids]
        if item.get('raw'):
            upd[0][2] = re.sub('^-', '', upd[0][2])
            item['raw'] = [r for r in raw if r[0] not in ids]
            item['notes'] = [r for r in item['notes'] if r[0] != nid and r[0] not in ids] + upd
        assert [r for r in item['notes'] if r[0] == nid], 'invalid result'

        self.save_page(page)
        self.write(dict(nid=nid))

    def ignore_note(self, page, tag):
        ids = [int(r) for r in self.get_argument('ignore').split(',') if r]
        item = page['notes'].get(tag)
        raw = [r for r in item['raw'] if r[0] in ids]
        for r in raw:
            if r[2][0] == '-':
                r[2] = r[2][1:]
            else:
                r[2] = '-' + r[2]
        self.save_page(page)
        self.write(dict(count=len(raw)))


handlers = [CbHomeHandler, PageNewHandler, PageHandler, HtmlDownloadHandler, RowPairsHandler,
            ParagraphOrderHandler, SplitParagraphHandler, EndMergeHandler, FetchHtmlHandler, PageNoteHandler]


def make_app():
    return Application(
        [(c.URL, c) for c in handlers],
        default_handler_class=CbHomeHandler,
        debug=options.debug,
        compiled_template_cache=False,
        static_path=path.join(BASE_DIR, 'assets'),
        template_path=THIS_PATH
    )


if __name__ == '__main__':
    options.parse_command_line()
    app = make_app()
    app.listen(options.port)
    logging.info('Start the service on http://localhost:%d' % (options.port,))
    ioloop.IOLoop.current().start()
