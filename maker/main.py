#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import json
import logging
from os import path
from glob import glob
import shutil
import fix_util as fix
from tornado import ioloop, gen
from tornado.web import Application, RequestHandler
from tornado.options import define, options
from tornado.escape import to_basestring, json_decode, json_encode
from tornado.httpclient import AsyncHTTPClient
from tornado.httpclient import HTTPError

THIS_PATH = path.abspath(path.dirname(__file__))
BASE_DIR = path.dirname(THIS_PATH)
DATA_DIR = path.join(THIS_PATH, 'data')

define('port', default=8002, help='run port', type=int)
define('debug', default=True, help='the debug mode', type=bool)


class BaseHandler(RequestHandler):
    @staticmethod
    def load_page(pid):
        filename = path.join(DATA_DIR, pid + '.json')
        with open(filename) as f:
            return json.load(f)

    @staticmethod
    def save_page(page):
        filename = path.join(DATA_DIR, '{}.json'.format(page['info']['id']))
        with open(filename, 'w') as f:
            json.dump(page, f, ensure_ascii=False, indent=2)

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

    def on_error(self, e):
        self.send_error(500, reason=str(e))


class HomeHandler(BaseHandler):
    URL = '/'

    def get(self):
        try:
            for fn in glob(path.join(THIS_PATH, 'example', '*.json')):
                if not path.exists(path.join(DATA_DIR, path.basename(fn))):
                    shutil.copy(fn, DATA_DIR)

            files = sorted(glob(path.join(DATA_DIR, '*.json')))
            pages = [json.load(open(fn)) for fn in files]
            self.render('index.html', pages=[
                dict(id=p['info']['id'], caption=p['info']['caption'], url='/page/' + p['info']['id'])
                for p in pages])
        except Exception as e:
            self.on_error(e)


class PageNewHandler(BaseHandler):
    URL = '/page/new'

    def post(self):
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
            self.write({'url': '/page/' + pid})
        except Exception as e:
            self.on_error(e)


class PageHandler(BaseHandler):
    URL = '/page/([A-Za-z0-9_]+)'

    def get(self, pid):
        try:
            page = self.load_page(pid)
            info = page['info']
            step = int(self.get_argument('step', 0))
            if step > 0:
                info['step'] = step - 1
                self.save_page(page)
                return self.redirect('/page/' + pid)

            step = info.get('step', 0)
            if step > 1:
                if page.get('html_end'):
                    page['html'] = page['html_end']
                else:
                    step = 1
            if step > 0 and not page.get('html'):
                step = 0

            name = info['id'].split('_')[0]
            juan = int((info['id'].split('_')[1:] or [1])[0])
            cb_download_url = info.get('cb_download_url') or '{0}_{1:0>3d}'.format(name, juan)

            self.render('page.html', page=page, info=info, step=step, id=info['id'],
                        rowPairs='||'.join(page.get('rowPairs', [])),
                        cb_download_url=cb_download_url)
        except Exception as e:
            self.on_error(e)

    def post(self, pid):
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


class HtmlDownloadHandler(BaseHandler):
    URL = '/cb/download/([A-Za-z0-9_]+)'

    @gen.coroutine
    def post(self, pid):
        try:
            cb_download_url = to_basestring(self.get_argument('urls', ''))
            urls = [s.split('+') for s in cb_download_url.split('|')] if cb_download_url else []

            page = self.load_page(pid)
            if urls and cb_download_url == page['info'].get('cb_download_url') and page.get('html_org'):
                page['html'] = page['html_org'][:]
                page['info']['step'] = 1
                self.rollback(page)
            else:
                content = []
                for col in urls:
                    html = None
                    for name in col:
                        name = name.strip()
                        if not name:
                            continue
                        r = yield self.fetch_cb(name)
                        if not r:
                            return
                        html = fix.convert_cb_html(html, r, name)
                    if html:
                        content.append(html)

                if not content or len(content) > 12:
                    return self.send_error(505, reason='only support 1~12 columns')

                page['info'].update(dict(step=1, cols=len(content), cb_download_url=cb_download_url))
                content = fix.merge_cb_html(content)
                page['html'] = page['html_org'] = content.split('\n')
                page['log'] = []

            self.save_page(page)
            self.write({})
            self.finish()
        except Exception as e:
            self.on_error(e)

    @staticmethod
    def rollback(page):
        if page.get('html_org') and page.get('log'):
            page['html'] = page['html_org'][:]
            for log in page['log']:
                m = re.search(r'^Split paragraph #(p\d+\w*) at (\d+) as result #([^:]+): (.+@.*)$', log)
                if m:
                    pid, index_s, new_ids, text = m.group(1), m.group(2), m.group(3), m.group(4)
                    new_ids, index = new_ids.split(','), int(index_s)
                    print(text)
                    html0 = page['html'][index]
                    if pid not in html0:
                        t0 = text.split('@')[0]
                        idx = html0.index(t0) if t0 in html0 else 20
                        logging.warning(pid + ' not at index ' + index_s)

                    texts = text.split('@')
                    r = [{'text': texts[0]}]
                    for (i, text) in enumerate(texts[1:]):
                        r.append({'id': new_ids[i], 'text': text})
                    print(r, texts)
                    SplitParagraphHandler.split_p(index, r, page)


class RowPairsHandler(BaseHandler):
    URL = '/row-pairs/([A-Za-z0-9_]+)'

    def post(self, pid):
        try:
            pairs = self.get_argument('pairs').split('||')

            page = self.load_page(pid)
            page['rowPairs'] = pairs
            self.save_page(page)
            self.write({})
        except Exception as e:
            self.on_error(e)


class SplitParagraphHandler(BaseHandler):
    URL = '/split-p/([A-Za-z0-9_]+)'

    def post(self, pid):
        try:
            data = json_decode(self.get_argument('data'))
            result = data['result']
            page = self.load_page(pid)

            index, log = -1, None
            for (i, text) in enumerate(page['html']):
                prefix = "<p id='{}'".format(data['id'])
                if prefix in text:
                    index = i
                    log = 'Split paragraph #{0} at {1} as result #{2}: {3}'.format(
                        data['id'], i, ','.join(str(r['id']) for r in result[1:]), data['text'])
                    logging.info(log)
                    assert text.index(prefix) == 0
                    self.split_p(i, result, page)
                    break

            if index >= 0:
                page['log'].append(log)
                self.save_page(page)
            self.write(dict(index=index))
        except Exception as e:
            self.on_error(e)

    @staticmethod
    def split_p(i, result, page):
        page['html'][i] = re.sub(r'>.+</p>', '>{}</p>'.format(result[0]['text']), page['html'][i])
        for j in range(len(result) - 1, 0, -1):
            page['html'].insert(i + 1, "<p id='{0}'>{1}</p>".format(result[j]['id'], result[j]['text']))


class EndMergeHandler(BaseHandler):
    URL = '/end-merge/([A-Za-z0-9_]+)'

    def post(self, pid):
        try:
            html = self.get_argument('html', '').strip()
            page = self.load_page(pid)
            page['html_end'] = html.split('\n') if html else page['html']
            page['info'].update(step=2)
            self.save_page(page)
            self.write({})
        except Exception as e:
            self.on_error(e)


class FetchHtmlHandler(BaseHandler):
    URL = '/fetch-cb-html/(\w+_\d+)'

    @gen.coroutine
    def get(self, name):
        try:
            html = yield self.fetch_cb(name)
            if html: self.write(dict(html=html))
            self.finish()
        except Exception as e:
            self.on_error(e)


class PageNoteHandler(BaseHandler):
    URL = '/page_note/([A-Za-z0-9_]+)'

    def get(self, pid):
        try:
            tag = self.get_argument('tag')
            page = self.load_page(pid)
            notes = page.get('notes', {}).get(tag, {})
            self.write(notes)
        except Exception as e:
            self.on_error(e)

    def post(self, pid):
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


def make_app():
    handlers = [HomeHandler, PageNewHandler, PageHandler, HtmlDownloadHandler, RowPairsHandler,
                SplitParagraphHandler, EndMergeHandler, FetchHtmlHandler, PageNoteHandler]
    return Application(
        [(c.URL, c) for c in handlers],
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
