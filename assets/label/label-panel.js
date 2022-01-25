let $labelPanel = $('.label-panel > div'), label = {};

// 开始合并注解到原文
function initNotes(notes, noteTag, cellClass) {
  label.noteTag = noteTag;
  label.cellClass = cellClass;
  label.cells = $(cellClass);

  $('.init-notes-btn').parent().removeClass('active');
  $('.init-notes-' + cellClass.substring(cellClass.length - 1)).parent().addClass('active');

  $labelPanel.html(notes.map(note => {
    let $tag = label.cells.find('[data-note-id=' + note[0] + ']'),
        title = [];
    for (let i = 0; i + 2 < note.length; i += 3) {
      title.push(note[i + 1]);
    }
    title = title.join('\n');
    return '<p id="note' + note[0] + '" class="' + ($tag.length ? 'linked' : '') +
      '">' + note[0] + ': <span title="' + (title.indexOf('\n') > 0 || title.length > 20 ? title : '') + '">'
       + note[1] + '</span>: ' + note[2] + '</p>';
  }).join('\n'));

  label.cells.find('.note-tag').each(function() {
    let $tag = $(this),
        id = parseInt($tag.attr('data-note-id')),
        note = notes.filter(item => item[0] == id)[0],
        title = [];

    for (let i = 0; i + 2 < note.length; i += 3) {
      title.push(note[i + 1]);
    }
    $tag.attr('title', title.join('\n'));
  });
}

// 在右边标注面板双击，放弃第一条注解
$labelPanel.dblclick(function() {
  function remove(first) {
    let $p = $('.label-panel p:first-child');
    if (first || $p.hasClass('linked')) {
      $p.fadeOut('fast', function() {
        $p.remove();
        remove();
      });
    }
  }
  remove(true);
});

// 在标注面板单击注解行，高亮显示正文有此引用处
$(document).on('click', '.label-panel p.linked', function (e) {
  let $p = $(e.target).closest('p'),
      id = $p.attr('id').substring(4),
      $tag = label.cells.find('.note-tag[data-note-id=' + id + ']');
  if ($tag.length) {
    let $kePan = $tag.closest('[ke-pan]');
    highlightKePan($kePan.attr('ke-pan'), $kePan[0]);
  }
});

// 在有科判的正文处单击，插入注解标记
$(document).on('click', '[ke-pan]', function (e) {
  let $this = $(e.target),
      $p = $('.label-panel p:first-child'),
      id = $p.attr('id').substring(4),
      text = $p.text().split(': ');

  if ($this.hasClass('note-tag') || $this.find('.note-tag').length) return;
  if ($this.closest(label.cellClass).length < 1) {
    return alert('栏不匹配');
  }
  $p.remove();
  $('<p class="note-p" data-note-id="' + id + '"><span class="org-text">' + text[1] +
    '</span><span class="note-text">' + text[2] + '</span></p>').insertAfter($this);
  $this.append($('<span class="note-tag" data-note-id="' + id + '" title="' + text[1] + '">' + label.noteTag + '</span>'));
});

// 用于复制 #content 的网页代码
function outputContent() {
  $('.note-tag').attr('title', null);
  $('.note-p').remove();
  $('.active').removeClass('active');
  let html = $('#content').prop('outerHTML');
  html = html.replace(' style="padding-left: 0px;"', '').replace(/class=""/g, '')
  console.log(html);
}
