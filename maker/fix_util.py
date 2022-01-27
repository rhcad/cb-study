#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re


def convert_cb_html(content, html, name):
    def fix_juan(text):
        text = re.sub(r"'body'>\n[^\n]*?<p ", lambda _: _.group() + "title='{}' ".format(name), text)
        text = text.strip().replace('><p', '>\n<p')
        text = re.sub(r"'body'>[\s\n]*(No[^<>]+)<", lambda _: _.group().replace(_.group(1), ''), text)
        text = re.sub(r"<span class='lineInfo' line='[^'>]+'></span>| class=\"\"", '', text)
        text = re.sub(r"<p class='juan'>[^<>]+</p>\n</div>",
                      lambda _: _.group().replace("'juan'", "'juan juan-end'"), text)
        return text

    if not content:
        m = re.search(r"(<div id='body'>(.|\n)+)<div id='cbeta-copyright'>", html, re.M)
        html = m and m.group(1)
        if html:
            content = re.sub('^<div', '<div class="original"', fix_juan(html))
    else:
        m = re.search(r"<div id='body'>((.|\n)+)<div id='cbeta-copyright'>", html, re.M)
        html = m and m.group(1)
        if html:
            content = re.sub(r'</div>\n*$', fix_juan(html), content)
    return content


def merge_cb_html(content):

    def sub_p(m):
        ids['pid'] += 1
        return "{0} id='p{1}'{2}".format(m.group()[:-1], ids['pid'], m.group()[-1])

    def sub_g(m):
        ids['gid'] += 1
        return "<div id='g{0}' {1}".format(ids['gid'], m.group(1))

    def sub_lg_row(m):
        if m.group(1) and m.group(2) == 'lg':
            ids['gid'] = re.search(r'g\d+', m.group(1)).group()
            ids['rid'] = 0
        elif not m.group(1) and m.group(2) == 'lg-row':
            ids['rid'] += 1
            return m.group().replace('<div', "<div id='{0}-{1}'".format(ids['gid'], ids['rid']))
        return m.group()

    ids = dict(pid=0, gid=0, rid=0)
    html = ''.join(re.sub("<div ([^<>]*)id='body'>", lambda m: "<div {0}id='body{1}'>".format(m.group(1), i), html)
                   for (i, html) in enumerate(content))
    html = re.sub(r' style=\"[^"\'<>]+\"', '', html)
    html = re.sub(r'<(p)[ >]', sub_p, html)
    html = re.sub(r'<div (class="lg[ "])', sub_g, html)
    html = re.sub(r'<div( id=\'g\d+\')? class="(lg|lg-row)[ "]', sub_lg_row, html)
    return html
