function fetchNote(pageId, val, cols, reset, success) {
  const [tag, name, desc] = /^\d+$/.test(val[0]) ? val.slice(1) : val

  if (/\s/.test(tag) || !name) {
    return showError('格式错误', '标记字或经卷号错误，请按提示格式输入。')
  }
  if (/^\d+$/.test(val[0])) {
    cols = [parseInt(val.shift())]
  }
  if (cols.length > 1) {
    return showError('获取失败', '请切换为只显示一栏再重试。')
  }
  $.get('/cb/html/' + name, r => {
    const lines = [], $h = $(r.html), line0 = $h.find('.lineInfo').attr('line')
    let lastLine = line0

    $h.find('.div-orig,.div-commentary').each((i, div) => {
      $('.doube-line-note', div).each((_, note) => (note.innerText = `(${note.innerText})`))
      const text = div.innerText.split('\n').map(s => s.trim())
          .filter(s => s && !/^△/.test(s)).join('\n'),
          line = $('span.lineInfo', div.closest('p') || div).attr('line') || lastLine
      lastLine = line
      if (text) {
        lines.push({orig: /div-orig/.test(div.className) ? '1' : '0', text: text, line: line})
      }
    })
    if (lines.length < 1) {
      let lastNoLine;
      lastLine = line0
      $(r.html).find('p,.lg-row').each((i, p) => {
        const text = p.innerText.trim(),
                line = $('span.lineInfo', p).attr('line'),
                item = {text: text, line: line, raw: true}
        lastLine = line || lastLine
        if (text) {
          if (lastNoLine) {
            lastNoLine.line = line || lastLine
          }
          lastNoLine = !line && item
          lines.push(item);
        }
      });
    }
    $.post('/cb/page/note/' + pageId, {
      tag: tag, name: name, desc: desc, col: cols[0], reset: reset,
      lines: JSON.stringify(lines)}, r => {
      const split = r.split ? '，拆分出 ' + r.split + ' 条注解' : ''
      showSuccess('保存注解', `${tag} 导入了 ${r.count} 条注解${split}。`, r.count && (success || reload))
    }).error(ajaxError('保存注解失败'))
  }).error(ajaxError('获取失败'))
}
