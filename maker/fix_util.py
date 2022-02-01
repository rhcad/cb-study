#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re


def convert_cb_html(content, html, name):
    def fix_juan(text):
        # 取经典编号文本，例如 No. 236a [Nos. 220(9), 235, 237-239]
        r = re.search(r"'body'>[\s\n]*(No[^<>]+)<", text)
        s_no = r and "<span class='cb-no'>" + r.group(1) + "</span>" or ''

        # 在 body 下的第一行元素中加入 title 属性和编号文本
        text = re.sub(r"('body'>\n[^\n]*?<p )([^\n]+?)</p>",
                      lambda _: _.group(1) + "title='{}' ".format(name) + _.group(2) + s_no + '</p>', text)
        text = re.sub(r"'body'>[\s\n]*(No[^<>]+)<", lambda _: _.group().replace(_.group(1), ''), text)

        # 段落和偈颂的标记换行到行首
        text = re.sub(r'\n+</div>', '</div>', text.strip())  # 行首的 </div> 移到上一行末
        text = re.sub(r'><(p|div class=[\'"](cell|row)|div [^>]+lg-|div id=)', lambda _: '>\n' + _.group()[1:], text)

        # 偈颂元素前的 「 移到内部
        text = re.sub(r'>([「])((<div [^>]+lg-[^>]+>)+)', lambda _: '>' + _.group(2) + _.group(1), text)

        # 去掉行号span、空的类属性
        text = re.sub(r"<span class='lineInfo' line='[^'>]+'></span>| class=\"\"", '', text)

        # 最后的卷改为卷尾
        text = re.sub(r"<p class='juan'>[^<>]+</p>\n</div>",
                      lambda _: _.group().replace("'juan'", "'juan juan-end'"), text)

        # 后面有卷时加上编号文本，将先前的(序言)去掉编号文本
        if re.search("(class='juan')(>[^<]+?)</p>", text):
            text = text.replace(s_no, '')
            text = re.sub("(class='juan')(>[^<]+?)</p>", lambda _: _.group(1) + " title='{}'".format(
                name) + _.group(2) + s_no + '</p>', text, count=1)

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
            ids['gid'] = int(re.search(r'g\d+', m.group(1)).group()[1:])
            ids['rid'] = 0
        elif not m.group(1) and m.group(2) == 'lg-row':
            ids['rid'] += 1
            return m.group().replace('<div', "<div id='g{0}-{1}'".format(ids['gid'], ids['rid']))
        return m.group()

    ids = dict(pid=0, gid=0, rid=0)
    for (i, html) in enumerate(content):
        html = re.sub("<div ([^<>]*)id='body'>", lambda m: "<div {0}id='body{1}'>".format(m.group(1), i), html)
        html = re.sub(r' style=\"[^"\'<>]+\"', '', html)
        html = re.sub(r'<(p)[ >]', sub_p, html)
        html = re.sub(r'<div (class="lg[ "])', sub_g, html)
        html = re.sub(r'<div( id=\'g\d+\')? class="(lg|lg-row)[ "]', sub_lg_row, html)
        content[i] = html
