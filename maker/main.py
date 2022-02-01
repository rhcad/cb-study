#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
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

define('port', default=8002, help='run port', type=int)
define('debug', default=True, help='the debug mode', type=bool)


class CbBaseHandler(RequestHandler):
    def on_error(self, e):
        traceback.print_exc()
        self.send_error(500, reason=str(e))

    @staticmethod
    def load_page(pid):
        filename = path.join(DATA_DIR, pid + '.json')
        assert path.exists(filename), 'page {} not exists'.format(pid)
        with open(filename) as f:
            return json.load(f)

    @staticmethod
    def save_page(page):
        filename = path.join(DATA_DIR, '{}.json'.format(page['info']['id']))
        with open(filename, 'w') as f:
            json.dump(page, f, ensure_ascii=False, indent=2, sort_keys=True)

    @staticmethod
    def reset_html(page):
        page['html'] = []
        for a in page['html_org']:
            page['html'].extend(a)

    @gen.coroutine
    def fetch_cb(self, name):
        cache_file = path.join(DATA_DIR, 'cache', name + '.html')
        if path.exists(cache_file):
            return open(cache_file).read()

        url = 'https://api.cbetaonline.cn/download/html/{}.html'.format(name if '_' in name else name + '_001')
        client = AsyncHTTPClient()
        try:
            r = yield client.fetch(url, connect_timeout=15, request_timeout=15)
            if r.error:
                return self.send_error(504, reason='fail to fetch {0}: {1}'.format(url, str(r.error)))

            r = to_basestring(r.body)
            with open(cache_file, 'w') as f:
                f.write(r)
            return r
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
    def _split_p_in_rollback(id_map, index, new_ids, page, pid, text):
        new_ids = new_ids and new_ids.split('#')[1].split(',')
        base_id = re.sub(r'\d[a-z].*$', lambda _: _.group(0)[0], pid)
        texts = text.split('@')
        r = [{'text': texts[0]}]
        for (i, text) in enumerate(texts[1:]):
            if new_ids:
                r.append({'id': new_ids[i], 'text': text})
            else:
                id_map[base_id] = id_map.get(base_id, ord('a') - 1) + 1
                r.append({'id': base_id + chr(id_map[base_id]), 'text': text})
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
            self.render('cb_home.html', pages=[
                dict(id=p['info']['id'], caption=p['info']['caption'], url='/cb/page/' + p['info']['id'])
                for p in pages])
        except Exception as e:
            self.on_error(e)


class PageNewHandler(CbBaseHandler):
    URL = '/cb/page/new'

    def post(self):
        """创建原典页面"""
        try:
            pid = to_basestring(self.get_argument('id', ''))
            caption = to_basestring(self.get_argument('caption', '')).strip()
            if not re.match(r'^[A-Za-z0-9_]{2,8}$', pid):
                return self.send_error(501, reason='invalid id')
            if not caption or len(caption) > 10:
                return self.send_error(502, reason='invalid caption')

            filename = path.join(DATA_DIR, pid + '.json')
            if path.exists(filename):
                return self.send_error(503, reason='file exists')

            self.save_page({'info': dict(id=pid, caption=caption), 'log': []})
            self.write({'url': '/cb/page/' + pid})
        except Exception as e:
            self.on_error(e)


class PageHandler(CbBaseHandler):
    URL = r'/cb/page/([\w_]+)'

    def get(self, pid):
        """显示原典页面"""
        try:
            page = self.load_page(pid)
            info = page['info']
            step = int(self.get_argument('step', 0))
            if step > 0:
                info['step'] = step - 1
                self.save_page(page)
                return self.redirect('/cb/page/' + pid)

            step = info.get('step', 0)
            if step > 1:  # 完成制作，或后续步骤
                if page.get('html_end'):
                    page['html'] = page['html_end'][:]
                else:
                    step = 1  # 段落分组
            if step > 0 and not page.get('html'):
                step = 0

            name = pid.split('_')[0]
            juan = int((pid.split('_')[1:] or [1])[0])
            cb_ids = info.get('cb_ids') or '{0}_{1:0>3d}'.format(name, juan)

            if self.get_argument('export', 0):
                json_files = ['{0}-{1}.json.js'.format(pid, re.sub('_.+$', '', v['name']))
                              for tag, v in (page.get('notes') or {}).items()]
                note_names = [['{0}Notes'.format(re.sub('_.+$', '', v['name'])), v.get('desc', v['name'])]
                              for tag, v in (page.get('notes') or {}).items()]
                html = self.render_string('cb_export.html', page=page, info=info, id=pid,
                                          json_files=json_files, note_names=note_names)
                return self.write(dict(html=to_basestring(html)))

            self.render('cb_page.html', page=page, info=info, step=step, id=pid,
                        rowPairs='||'.join(page.get('rowPairs', [])),
                        paragraph_ids=','.join(ParagraphOrderHandler.get_ids(page)),
                        cb_ids=cb_ids)
        except Exception as e:
            self.on_error(e)

    def post(self, pid):
        """保存网页内容"""
        try:
            page = self.load_page(pid)
            html = to_basestring(self.get_argument('html', '')).strip()
            step = int(self.get_argument('step', page['info']['step']))
            field = 'html_end' if step > 1 and page.get('html_end') else 'html'

            if re.search('<p id', html) and html != '\n'.join(page[field]):
                logging.info('save html')
                page[field] = html.split('\n')
                self.save_page(page)
                self.write({})
        except Exception as e:
            self.on_error(e)


class HtmlDownloadHandler(CbBaseHandler):
    URL = r'/cb/page/fetch/([\w_]+)'

    @gen.coroutine
    def post(self, pid):
        """从CBeta获取原文HTML"""
        try:
            cb_ids = to_basestring(self.get_argument('urls', ''))
            urls = [s.split('+') for s in cb_ids.split('|')] if cb_ids else []

            page = self.load_page(pid)
            if urls and cb_ids == page['info'].get('cb_ids') and page.get('html_org'):
                page['info']['step'] = 1
            else:
                content = []
                for col in urls:
                    html = None
                    for name in col:
                        name_desc = re.split(r'\s+', name.strip())
                        name, desc = name_desc[0], len(name_desc) > 1 and ' ' + name_desc[1] or ''
                        if not name:
                            continue
                        r = yield self.fetch_cb(name)
                        if not r:
                            return
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
    URL = r'/cb/page/merge/add/([\w_]+)'

    def post(self, pid):
        """保存段落分组数据"""
        try:
            pairs = self.get_argument('pairs').split('||')

            page = self.load_page(pid)
            page['rowPairs'] = pairs
            self.save_page(page)
            self.write({})
        except Exception as e:
            self.on_error(e)


class ParagraphOrderHandler(CbBaseHandler):
    URL = r'/cb/page/p/order/([\w_]+)'

    def get(self, pid):
        """获取所有段落编号"""
        try:
            page = self.load_page(pid)
            self.write(dict(ids=self.get_ids(page)))
        except Exception as e:
            self.on_error(e)

    @staticmethod
    def get_ids(page):
        return [re.search(r"id='([pg]\d[a-z0-9_-]*)'", p).group(1) for p in page.get('html', [])
                if re.search(r"id='([pg]\d[a-z0-9_-]*)'", p)]


class SplitParagraphHandler(CbBaseHandler):
    URL = r'/cb/page/p/split/([\w_]+)'

    def post(self, pid):
        """保存段落拆分或合并的信息"""
        try:
            data = json_decode(self.get_argument('data'))
            result = data.get('result')
            id1, id2 = data.get('id'), data.get('id2')
            page = self.load_page(pid)
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

    def post(self, pid):
        """段落分组完成"""
        try:
            html = self.get_argument('html', '').strip()
            page = self.load_page(pid)
            old_html = page.get('html_end', [])
            page['html_end'] = html.split('\n') if html else page['html']
            page['info'].update(step=2)

            for (i, html) in enumerate(old_html):
                if re.search(r'<note|note-tag|data-nid', html):
                    pid = re.search(r'')

            self.save_page(page)
            self.write({})
        except Exception as e:
            self.on_error(e)


class FetchHtmlHandler(CbBaseHandler):
    URL = r'/cb/html/(\w+_\d+)'

    @gen.coroutine
    def get(self, name):
        """从CBeta获取原文HTML"""
        try:
            html = yield self.fetch_cb(name)
            if html:
                self.write(dict(html=html))
            self.finish()
        except Exception as e:
            self.on_error(e)


class PageNoteHandler(CbBaseHandler):
    URL = r'/cb/page/note/([\w_]+)'

    def get(self, pid):
        """获取注解数据"""
        try:
            tag = self.get_argument('tag')
            page = self.load_page(pid)
            notes = page.get('notes', {}).get(tag, {})
            self.write(notes)
        except Exception as e:
            self.on_error(e)

    def post(self, pid):
        """保存注解数据"""
        try:
            tag = self.get_argument('tag')
            name = self.get_argument('name')
            desc = self.get_argument('desc', '')
            col = int(self.get_argument('col', 0) or 0)
            lines = json_decode(self.get_argument('lines'))

            page = self.load_page(pid)
            nid = page['info'].get('note_id', 0)
            page['notes'] = page.get('notes', {})

            assert tag not in page['notes'], 'tag exists'
            notes, orig = [], ''
            for r in lines:
                if not r.get('text'):
                    continue
                if r['orig']:
                    orig = r['text']
                else:
                    if not orig:
                        logging.warning('ignore comment: ' + r['text'])
                    nid += 1
                    notes.append([nid, orig, r['text']])
                    orig = None

            if notes:
                nid = int((nid + 19) / 10) * 10
                page['notes'][tag] = dict(tag=tag, name=name, desc=desc, col=col, notes=notes)
                page['info']['note_id'] = nid

            logging.info('{0}: add {1} comments'.format(tag, len(notes)))
            self.save_page(page)
            self.write(dict(tag=tag, count=len(notes)))
        except Exception as e:
            self.on_error(e)


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
