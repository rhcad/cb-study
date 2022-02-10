function fetchNote(pageId, val, cols, reset, success) {
  const [tag, name] = val

  if (cols.length > 1) {
    return showError('获取失败', '请切换为只显示一栏再重试。')
  }
  $.get('/cb/html/' + name, r => {
    const lines = []
    $(r.html).find('.div-orig,.div-commentary').each((i, div) => {
      const text = div.innerText.split('\n').map(s => s.trim()).filter(s => s && !/^△/.test(s)).join('\n')
      if (text) {
        lines.push({orig: /div-orig/.test(div.className) ? '1' : '0', text: text})
      }
    })
    if (lines.length < 1) {
      let lastNoLine;
      $(r.html).find('p,.lg-row').each((i, p) => {
        const text = p.innerText.trim(),
                line = $('span.lineInfo', p).attr('line'),
                item = {text: text, line: line}
        if (text) {
          if (line && lastNoLine) {
            lastNoLine.line = line
          }
          lastNoLine = !line && item
          lines.push(item);
        }
      });
    }
    $.post('/cb/page/note/' + pageId, {
      tag: tag, name: name, desc: val.slice(2).join(' '), col: cols[0], reset: reset,
      lines: JSON.stringify(lines)}, r => {
      showSuccess('保存注解', `${tag} 导入了 ${r.count} 条注解。`, r.count && (success || reload))
    }).error(ajaxError('保存注解失败'))
  }).error(ajaxError('获取失败'))
}
