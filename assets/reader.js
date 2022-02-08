// reader.js
// Updated on 2022.1.21
/**
 * toggleLineNo, toggleXu, toggleParaBox
 * showLeftColumn, showRightColumn, showTwoColumns
 * enlargeFont, reduceFont, enlargeKePanFont, reduceKePanFont
 * setKePanWidth
 * movePairs
 * convertToSpanWithTag
 * showInlineKePan, showInlineWithoutKePan
 * highlightKePan, showKePanPath
 * getKePanId
 * insertNotes
 */

try {
  window.cbOptions = JSON.parse(localStorage.getItem('cbOptions' + window.pageName))
} catch (e) {}
if (!window.cbOptions || typeof window.cbOptions !== 'object') {
  window.cbOptions = {};
}

function saveCbOptions() {
  if (typeof window.pageName === 'string') {
    localStorage.setItem('cbOptions' + window.pageName, JSON.stringify(cbOptions));
  }
}

/**
 * 显隐行号
 */
function toggleLineNo() {
  $('#content [id^=p], #content [id^=g]').each((i, p) => {
    p.setAttribute('data-line-no', '[' + p.getAttribute('id').replace(/^g\d+-/, '') + ']');
  });
  $('#content,#merged').toggleClass('show-line-no');
  $('#show-line-no').closest('li').toggleClass('active');
}

/**
 * 显隐序言(.div-xu)
 * @param {boolean} [save] 是否保存选项
 */
function toggleXu(save) {
  if ($('.div-xu,.xu-more').length) {
    const hide = !$('body').hasClass('hide-div-xu');
    $('.div-xu').each(function () {
      if (!$('.xu-more', this).length && !/xu-more/.test(this.className)) {
        $(this).toggle(hide);
      }
    });
    $('body').toggleClass('hide-div-xu', hide);
    updateColumnStatus();
    if (save) {
      cbOptions.hideXu = hide;
      saveCbOptions();
    }
  }
}

/**
 * 显隐段落和span框，用于调试科判分布
 */
function toggleParaBox() {
  $('#content,#merged').toggleClass('show-box');
  $('#show-box').closest('li').toggleClass('active');
}

/**
 * 显示左边文(.row > .cell-0)
 */
function showLeftColumn() {
  const $left = $('.cell-0,.original#body0'), $right = $('.cell,.original');
  $right.hide();
  $left.show();
  updateColumnStatus();
}

/**
 * 显示右边文(.row > .cell-1)
 */
function showRightColumn() {
  const $left = $('.cell,.original'), $right = $('.cell-1,.original#body1');
  $left.hide();
  $right.show();
  updateColumnStatus();
}

/**
 * 显示左右对照文(.row > .cell-0.col-xs-6)
 */
function showTwoColumns() {
  const $col = $('.cell,.original'),
      count = $($col[0]).closest('.row').children('.cell').length;

  $col.show();
  $('body').attr('data-col-count', count > 1 ? count : null);
  updateColumnStatus();
}

/**
 * 得到可见栏的栏序
 */
function getVisibleColumns() {
  const $cols = $( $('.cell,.original')[0]).closest('.row').children('.cell:visible');
  return $cols.map(function () {
    return parseInt(matchAll(/cell-(\d+)/g, this.className)[0]);
  }).get().filter(v => !isNaN(v));
}

function matchAll(re, str) {
  let match;
  const matches = [];

  while (match = re.exec(str)) {
    matches.push.apply(matches, match.slice(1));
  }
  return matches;
}

/**
 * 更新按钮和菜单状态
 */
function updateColumnStatus() {
  clearTimeout(_updateColumnStatusTm);
  _updateColumnStatusTm = setTimeout(() => {
    const liXu = $('.hide-xu').closest('li'), $showXu = $('.show-xu'),
        $xu = $('.div-xu:visible'), $more = $('.xu-more:visible');

    liXu.toggleClass('disabled', !$xu.length && !$more.length);
    liXu.toggleClass('active', $('body').hasClass('hide-div-xu'));
    $showXu.toggleClass('disabled', !$xu.length && !$more.length);
    $showXu.toggleClass('active', !$('body').hasClass('hide-div-xu'));

    const $left = $('.cell-0,.original#body0'),
        $right = $('.cell-1,.original#body-1'),
        $all = $('.cell,.original'),
        n = $all.filter((_, c) => $(c).is(':visible')).length;

    $('#show-left').closest('li').toggleClass('active', $left.is(':visible') && $right.is(':hidden'));
    $('#show-right').closest('li').toggleClass('active', $left.is(':hidden') && $right.is(':visible'));
    $('#show-both').closest('li').toggleClass('active', n === $all.length);
    $all.closest('#content,#merged').toggleClass('single-article', n === 1);

    $('.toggle-column > button').each(function () {
      const $btn = $(this), text = $btn.text(), idx = parseInt(text) - 1,
          $col = $(`.cell-${idx}, .original#body${idx}`),
          visible = !(cbOptions.colHide || {})['' + idx];

      if (idx >= 0) {
        $btn.toggleClass('active', visible);
        $btn.toggle($col.length > 0);
        $btn.attr('title', $col.find('[id][title]').attr('title'));
      }
    });

    $('#show-notes').closest('li').toggleClass('disabled', $('.note-tag').length < 1);
    $('#show-hide-txt').closest('li').toggleClass('disabled', $('.hide-txt').length < 1);
  }, 20);
}
let _updateColumnStatusTm;

/**
 * 设置左右对照等下拉菜单的状态
 */
function initCbLiStatus() {
  const $left = $('.cell-0,.original#body0'), $right = $('.cell-1,.original#body1');

  if ($left.length || $right.length) {
    if ($left.length && $right.length) {
      showTwoColumns();
    } else if (!$right.length) {
      showLeftColumn();
    }
  }
  if (!cbOptions.colHide && Array.isArray(window.colHideDefault)) {
    cbOptions.colHide = {};
    window.colHideDefault.forEach(c => (cbOptions.colHide['' + c] = true));
  }
  setTimeout(() => {
    Object.keys(cbOptions.colHide || {}).forEach(k => cbOptions.colHide[k] && toggleColumn(parseInt(k), false));
  }, 10);
  if (cbOptions.hideXu) {
    toggleXu(false);
  }
  $('.show-inline-ke-pan-btn').toggleClass('active', !cbOptions.hideInlineKePan)
      .closest('li').toggleClass('active', !cbOptions.hideInlineKePan);
  if (cbOptions.hideInlineKePan) {
    $('body').toggleClass('hide-inline-ke-pan', true);
  }

  updateColumnStatus();
}

/**
 * 正文增大字号
 */
function enlargeFont() {
  let fontSize = parseInt($('#content').css('font-size'));
  if (fontSize < 36) {
    fontSize++;
    $('#content,#merged').css('font-size', fontSize + 'px');
    cbOptions.fontSize = fontSize;
    saveCbOptions();
  }
}

/**
 * 正文减小字号
 */
function reduceFont() {
  let fontSize = parseInt($('#content').css('font-size'));
  if (fontSize > 8) {
    fontSize--;
    $('#content,#merged').css('font-size', fontSize + 'px');
    cbOptions.fontSize = fontSize;
    saveCbOptions();
  }
}

if (cbOptions.fontSize) {
  $('#content,#merged').css('font-size', cbOptions.fontSize + 'px');
}

/**
 * 增加科判树的字号
 */
function enlargeKePanFont() {
  let $j = $('#judgments'), fontSize = parseInt($j.css('font-size'));
  if (fontSize < 24) {
    fontSize += 2;
    $j.css('font-size', fontSize + 'px');
    cbOptions.keFontSize = fontSize;
    saveCbOptions();
  }
}

/**
 * 减小科判树的字号
 */
function reduceKePanFont() {
  let $j = $('#judgments'), fontSize = parseInt($j.css('font-size'));
  if (fontSize > 10) {
    fontSize -= 2;
    $j.css('font-size', fontSize + 'px');
    cbOptions.keFontSize = fontSize;
    saveCbOptions();
  }
}

if (cbOptions.keFontSize) {
  $('#judgments').css('font-size', cbOptions.keFontSize + 'px');
}

/**
 * 设置科判导航栏的宽度比例
 * @param {string} ratio 宽度比例
 */
function setKePanWidth(ratio) {
  if (ratio === 'toggle') {
    ratio = $('body').hasClass('hide-left-bar') ? $('.left-nav').css('width') : '';
  }
  cbOptions.kePanWidth = ratio;
  _setKePanWidth(ratio);
  saveCbOptions();
}

function _setKePanWidth(ratio) {
  if (parseInt(ratio) > 0) {
    $('body').removeClass('hide-left-bar');
    $('.left-nav').css('width', ratio);
  } else {
    $('body').addClass('hide-left-bar');
    ratio = 0;
  }
  $('#content,#merged,.task-steps').css('padding-left', ratio);
  $('li.ke-pan-ratio').each((i, li) => $(li).toggleClass('active', li.innerText === ratio ||
      li.innerText.indexOf('%') < 0 && ('' + ratio).indexOf('%') < 0));
}

if (document.getElementById('judgments')) {
  _setKePanWidth(cbOptions.kePanWidth !== undefined ? cbOptions.kePanWidth : window.innerWidth < 768 ? '' : '15%');
}

/**
 * 将多个段落编号的串转换为选择器数组
 * @param {string} idsText 空格分隔的段落编号串
 * @returns {string[]} 每个元素为一个段落的选择器串
 * @private
 */
function _toPairSelectors(idsText) {
  return idsText.split(' ').filter(s => s).map(s => {
    if (s && !/[.#-]/.test(s[0])) {
      if (/^\d/.test(s)) {
        s = 'p' + s;
      }
      s = '#' + s;
    }
    return s;
  });
}

let _newKePan = 0, _initKePanTm, _hasKeLine;
const kePanTypes = window.kePanTypes || [];

/**
 * 将一行编号（格式为“ id id... | id...”）的段落元素从 .original 移到 #merged 的左右对照元素内
 * @param {string} idsText 多行编号，每行用竖线符 | 隔开，编号之间用空格分隔，编号末尾有减号表示转为隐藏文本，有星号为移动原文
 *                         如果行首是“:ke ”，则解析为科判条目，随后的文本用减号表示缩减层级
 * @return {string} 警告文本
 */
function movePairs(idsText) {
  const $merged = $('#merged');

  if (/^:ke/.test(idsText)) {
    if (/^:ke\d? /.test(idsText)) { // 科判
      const type = parseInt(idsText[3]) || 1,
          text0 = idsText.replace(/^:ke\d?\s+/, ''),
          m = /^-+/.exec(text0),
          indent = m && m[0].length || 0,
          text = text0.replace(/^-+/, '');

      const $last = $merged.find(`.ke-line[data-ke-type="${type}"]:last-child`).addClass('has-next-ke');
      $(`<div ke-pan="${++_newKePan}" data-ke-type="${type}" class="ke-line first-ke" data-indent="${indent}">${text}</div>`)
          .appendTo($merged).toggleClass('first-ke', !$last.length);

      clearTimeout(_initKePanTm);
      _initKePanTm = setTimeout(_initKePanTree, 10);
    }
    return '';
  }

  const $articles = $('.original[id^="body"]'), // 未合并的各栏
      divs = $articles.map((i, a) => `<div class="cell cell-${i}"/>`),
      $row = $(`<div class="row">${divs.get().join('')}</div>`), // 新行块
      $divs = $row.children('.cell'), // 新行块的各栏
      colIds = idsText.split('|').map(s => _toPairSelectors(s)); // 各栏的段落号
  let count = 0, ret = '';

  if (!$divs.length || !colIds.length) {
    return ret;
  }
  colIds.forEach((ids, col) => {
    let $lg;
    for (const id of ids) {
      let id2 = id.replace(/[*-]+$/, ''), // 编号末尾有减号表示转为隐藏文本
          $el = $(id2 || 'e', $articles[col]),
          parent = $el.parent(),
          xu = $el.closest('.div-xu');

      if ($el.length) {
        $el.remove();
        if (xu.length) {
          $el.addClass($el.text().length > 40 ? 'xu-more' : 'div-xu');
        }
        if (/\*/.test(id)) {
          $el.addClass('moved');
        }
        if (/-[*]?$/.test(id)) {
          $el.addClass('hide-txt');
        } else {
          count++;
        }
        if ($el.hasClass('lg-row')) {
          let parentId = parent.attr('id');
          for (let i = 1; i < 100 && $('#' + parentId, $divs[col]).length; i++) {
            parentId = parent.attr('id') + 'c' + i;
          }
          $lg = $lg || $(`<div id='${parentId}' class="lg" data-line-no="[${parentId}]"/>`).appendTo($divs[col]);
          $lg.append($el);
          if (!parent.childElementCount) {
            parent.hide();
          }
        } else {
          $lg = null;
          $el.appendTo($divs[col]);
        }
      } else if (id2) {
        ret += `${id2.replace(/^[#.]/, '')} 不在第 ${col + 1} 栏中: ${idsText}\n`;
      }
    }
  });
  if (count === 0) {
    $row.addClass('hide-txt');
  }
  $merged.append($row);

  console.assert(!ret, ret);
  return ret;
}

/**
 * 切换科判类别
 * @param {string} type 科判类别，数字
 * @param {boolean} save 是否保存配置
 * @private
 */
function _switchKePanType(type, save) {
  const $judgments = $('#judgments'), item = kePanTypes.filter(t => t[0] === type)[0];

  $('body').toggleClass('cur-ke-pan-type', !!item)
  if (type === 'all') {
    $('.ke-line').show();
  } else if (item) {
    $('.ke-line').hide();
    $(`.ke-line[data-ke-type="${type}"]`).show();
    $judgments.text(item && item[1] || '');
  }
  $('.ke-pan-type').removeClass('active');
  $(`.ke-pan-type[data-ke-type="${type}"]`).addClass('active');
  cbOptions.kePanType = type;
  if (save) {
    saveCbOptions();
  }

  const $ke = item ? $(`.ke-line[data-ke-type="${type}"]`) : $('.ke-line'),
      data = [], levels = [],
      judgments = {core: {data: data, animation: 0}};

  const tree = $.jstree && $.jstree.reference('#judgments');
  if (tree) {
    tree.destroy();
  }

  if ($ke.length && $.jstree) {
    $ke.each((_, ke) => {
      const indent = parseInt(ke.getAttribute('data-indent') || 0),
          node = {id: ke.getAttribute('ke-pan'), text: ke.innerText, indent: indent};
      let i;

      for (i = levels.length - 1; i >= 0 && (!levels[i] || i >= indent); i--) {
      }
      if (i >= 0) {
        levels[i].children = levels[i].children || [];
        levels[i].children.push(node);
      } else {
        data.push(node);
      }
      levels.length = indent + 1;
      levels[indent] = node;
    });
    $judgments.jstree(judgments);

    $('#judgments').on('changed.jstree', function (e, data) {
      highlightKePan(data.node.id, 'nav');
    });
  }
}

function _initKePanTree() {
  const defaultType = cbOptions.kePanType || kePanTypes.length && kePanTypes[0][0];

  if (kePanTypes.length > 1) {
    const $select = $('<select id="ke-pan-select"/>').insertBefore($('#judgments'));
    for (let i = 0; i < kePanTypes.length; i++) {
      $select.append(new Option(kePanTypes[i][1] + ': ' + kePanTypes[i][2], kePanTypes[i][0]));
    }
    if (kePanTypes.length > 1) {
      $select.append(`<option value="all">全部科判</option>`);
    }
    $select.val(defaultType);
    $select.change(() => _switchKePanType($select.val(), true));
  }

  if (kePanTypes.length) {
    const $ratio = $('.dropdown-menu > .ke-pan-ratio:first-child');
    for (let i = 0; i < kePanTypes.length; i++) {
      $(`<li class="ke-pan-type" data-ke-type="${kePanTypes[i][0]}" title="${kePanTypes[i][2]}">
        <a>${kePanTypes[i][1]}</a></li>`).insertBefore($ratio);
    }
    if (kePanTypes.length > 1) {
      $(`<li class="ke-pan-type" data-ke-type="all"><a>全部科判</a></li>`).insertBefore($ratio);
    }
    $('<li role="separator" class="divider"></li>').insertBefore($ratio);
    $('.dropdown-menu > .ke-pan-type').click(e => {
      const type = e.target.closest('[data-ke-type]').getAttribute('data-ke-type');
      _switchKePanType(type, true);
      $('#ke-pan-select').val(type);
    });
  } else {
    delete cbOptions.kePanType;
  }

  _switchKePanType(defaultType, false);
  _hasKeLine = $('.ke-line').length > 0;
}

_initKePanTm = setTimeout(_initKePanTree, 50);

function _findKePanLineId(el) {
  let kid = el.getAttribute('ke-pan');
  if (!kid) {
    const arr = $('.ke-line:visible,p[id^=p]').map((i, p) => {
      const r = p.getBoundingClientRect();
      return {p: p, y: r ? r.top : 1e6};
    }).get();
    arr.sort((a, b) => a.y - b.y);
    let rows = arr.map(a => a.p), index = rows.indexOf(el.closest('p'));
    for (; index >= 0 && !kid; --index) {
      kid = rows[index].getAttribute('ke-pan');
    }
  }
  return kid;
}

/**
 * 单击科判节点后将当前选中文本提取为一个span，并设置其科判编号
 * @param {string} tag 科判标记的属性名，一般为 'ke-pan'
 * @param {string} value 科判编号
 * @param {string} text 科判文本
 */
function convertToSpanWithTag(tag, value, text) {
  let sel = window.getSelection(),  // 选中范围，非IE
      node = sel.anchorNode,  // 选择区的起点对象，要与结束对象focusNode相同，且为P内不属于span的普通文字
      p = node && node.parentElement, // 段落元素，应为P
      selText = sel.toString(); // 选择的文字

  if (selText && selText.trim() && value && text && p && p.tagName === 'P' &&
    node === sel.focusNode && node.nodeName === '#text') {
    p.innerHTML = p.innerHTML.replace(selText, `<span ${tag}="${value}">${selText}</span>`);
  } else {
    console.log(value, text, p);
  }
}

/**
 * 切换显隐正文内的科判标记，段内各项分行显示
 */
function showInlineKePan() {
  const tree = $.jstree && $.jstree.reference('#judgments');

  $('body').toggleClass('show-inline-ke-pan').removeClass('hide-ke-pan-txt');
  $('[ke-pan]').each((i, s) => {
    let $s = $(s), $j = $s.find('.ke-pan-text');

    if ($j.length) {
      $j.remove();
    } else {
      const node = tree && tree.get_node($s.attr('ke-pan'));
      if (node) {
        $j = $('<span class="ke-pan-text">[' + node.text.replace(/^.+、|[(（].+$/g, '') + ']</span>');
        $s.append($j);
      }
    }
  });
}

/**
 * 段内有科判标记的各项分行显示，不显示科判标记
 */
function showInlineWithoutKePan() {
  showInlineKePan();
  $('body').addClass('hide-ke-pan-txt');
  $('#show-inline-no-ke-pan').closest('li').toggleClass('active');
}

/**
 * 高亮显示科判节点对应的正文span片段
 * @param {string|number} kePanId 科判编号
 * @param {boolean|string} scroll 是否自动滚动正文到可见区域，或调用来源，值有 click、nav、footer、false
 * @param {number} [level] 调用层级
 * @returns {jQuery} 对应的正文span片段
 */
function highlightKePan(kePanId, scroll, level) {
  const tree = $.jstree && $.jstree.reference('#judgments');
  let $s = $('[ke-pan="' + kePanId + '"], [ke-pan^="' + kePanId + 'p"]');

  if (!tree) {
    return $s;
  }
  $s.addClass('highlight');
  if ($s[0]) {
    setTimeout(() => {
      $s.removeClass('highlight');
    }, 1000); // flash
  }

  if (!level) {
    $('[ke-pan]').removeClass('active').removeClass('hover');

    const node = tree.get_node(kePanId);
    if (scroll === 'click' && node && node.parents) { // 点击正文
      tree.close_all(); // 折叠其它节点
      for (const p of node.parents) {
        tree.open_node(p);
      }
    }
    tree.open_node(kePanId);
  }
  if (scroll === 'nav' && level < 2) { // 点击树节点
    tree.open_node(kePanId); // 展开本节点及其子节点
  }
  $s.addClass('active');

  const nodes = tree.get_children_dom(kePanId);
  if (nodes) {
    for (const node of nodes.get()) {
      let r = highlightKePan(node.getAttribute('id'), scroll, (level || 0) + 1);
      $s = $s[0] ? $s : r;
    }
  }

  if (scroll && scroll !== 'click' && $s[0] && !level) {
    scrollToVisible($s[0]);
  }
  if (scroll && scroll !== 'nav') {
    if (scroll !== 'footer') {
      showKePanPath(kePanId);
    }
    tree.deselect_all(true);
    tree.select_node(kePanId, true);
    _scrollTreeToVisible(tree, tree.get_node(kePanId));
  }

  return $s;
}

function _scrollTreeToVisible(tree, node) {
  const scrollOwner = document.getElementById('judgments').parentElement,
      sr = $(scrollOwner).offset(),
      $prev = tree.get_prev_dom(node), $next = tree.get_next_dom(node),
      r2 = $prev && $prev.offset(), r3 = $next && $next.offset();

  if (r2 && r2.top < sr.top + 50) {
    scrollOwner.scrollTop -= sr.top + 50 - r2.top;
  }
  if (r3 && r3.top - sr.top + 50 > scrollOwner.clientHeight) {
    scrollOwner.scrollTop += r3.top - sr.top + 50 - scrollOwner.clientHeight;
  }
}

/**
 * 让一个元素滚动到可见区域
 * @param {HTMLElement} element
 */
function scrollToVisible(element) {
  if (element && element.getBoundingClientRect) {
    clearTimeout(_scrollTm);
    _scrollTm = setTimeout(() => {
      let r = element.getBoundingClientRect();
      for (let i = 0; i < 10 && !(r && r.height); i++) {
        element = element.nextElementSibling;
        r = element && element.getBoundingClientRect();
      }
      if (r && r.height) {
        if (r.top < 60) {
          window.scrollBy(0, r.top - 60);
        }
        if (r.bottom > window.innerHeight - 100) {
          window.scrollBy(0, r.bottom - window.innerHeight + 100);
        }
      }
    }, 50);
  }
}
let _scrollTm;

/**
 * 在状态栏显示科判路径
 * @param {string|number} kePanId 科判编号
 * @param {string} [colTitle] 段落所在栏的标题
 */
function showKePanPath(kePanId, colTitle) {
  const tree = $.jstree && $.jstree.reference('#judgments');
  const node = tree && tree.get_node(kePanId);
  let texts = [];

  if (node) {
    for (const p of node.parents) {
      let t = tree.get_node(p).text;
      if (t) {
        texts.splice(0, 0, `<a onclick="highlightKePan('${p}', 'footer')">${t}</a>`);
      }
    }
    texts.push(`<a onclick="highlightKePan('${kePanId}', 'footer')">${node.text}</a>`);
  }
  texts = texts.length ? `<span>${texts.join('<span>/</span>')}</span>` : '';

  if (cbOptions.kePanType === 'all') {
    const type = $(`[ke-pan="${kePanId}"]`).attr('data-ke-type'),
        item = kePanTypes.filter(t => t[0] === type)[0];
    if (item) {
      texts += ` <span class="ke-pan-type-s" title="${item[2]}">${item[1]}</span>`
    }
  }
  $('footer>p:first-child').html(texts + (colTitle ? `<span class="col-title">${colTitle}</span>`: ''));
}

/**
 * 得到元素所在的科判编号
 * @param {HTMLElement} el 元素
 * @returns {string} 科判编号
 */
function getKePanId(el) {
  const kid = _hasKeLine && _findKePanLineId(el);
  if (kid) {
    return kid;
  }
  for (let i = 0; i < 3 && el; i++, el = el.parentElement) {
    if (el.getAttribute('ke-pan')) {
      return el.getAttribute('ke-pan');
    }
  }
}

function getNoteContent(note, title, rows, rawNote, desc) {
  for (let i = 0; i + 2 < note.length; i += 3) {
    title.push(note[i + 1]);
    rows.push(`<span data-id="${note[i]}" class="note-item${rawNote ? ' note-raw' : ''}"><span class="org-text">` +
        (!rawNote && note[i + 1].length > 4 ? note[i + 1].substring(0, 3) +
            '<span class="more" data-more="' + note[i + 1].substring(3) + '">…</span>' : note[i + 1]) +
        '</span><span class="note-text">' + note[i + 2] + '</span> ' +
        (!desc || i + 5 < note.length ? '' :
            `<span class="note-from" title="双击注解块可隐藏">${desc} <span class="p-close">×</span></span>`)
        + '</span>');
  }
  if (rawNote) {
    title[0] += ' ' + note[2] + '\n' + desc;
    title.length = 1;
  }
}

/**
 * 根据注解锚点插入注解段落
 * @param {jQuery} $side 占一栏的正文，如果只有一栏就可为 null
 * @param {Array[]} notes 每个注解元素为一个数组，其元素个数为三的整数倍，依次为注解ID、原文、注解内容
 * @param {string} [desc] 注解来源
 */
function insertNotes($side, notes, desc) {
  $side = $side || $('#content');
  $side.find('.note-tag').each(function() {
    let $tag = $(this),
      id = parseInt($tag.attr('data-nid')),
      note = notes.filter(item => item[0] === id)[0],
      $judg = $tag.closest('[ke-pan],p,.lg'),
      rawNote = note && /^\d\w+$/.test(note[1]),
      title = [], rows = [];

    if (!note) {
      return;
    }
    getNoteContent(note, title, rows, rawNote, desc);
    $tag.attr('title', title.join('\n'));

    const $exist = $(`.note-p[data-nid="${id}"]`);
    if ($exist.length && $exist.offset().top < $tag.offset().top) {
      $exist.remove();
      $exist.length = 0;
    }
    if (!$exist.length) {
      $(`<p class="note-p" data-nid="${id}">${rows.join('<br>')}</p>`)
          .insertAfter($judg.closest('.lg').length ? $judg.closest('.lg') : $judg);
    }
  });
}

// 在正文有科判标记的span上鼠标掠过
$(document).on('mouseover', '[ke-pan]', function (e) {
  let kePanId = getKePanId(e.target),
      tree = $.jstree && $.jstree.reference('#judgments'),
      node = tree && tree.get_node(kePanId),
      sel = 'span[ke-pan="' + kePanId + '"]',
      spans = $(sel),
      row = $(e.target).closest('.row');

  $('.hover').removeClass('hover');
  if (spans.length % 2 === 0 && node && tree.get_children_dom(node).length < 1) {
    let leftSpans = row.find('.cell-0').find(sel),
        rightSpans = row.find('.cell-1').find(sel);
    if (leftSpans.length === rightSpans.length) {
      let leftIndex = leftSpans.get().indexOf(e.target),
          rightIndex = rightSpans.get().indexOf(e.target);
      if (leftIndex >= 0) {
        $(rightSpans[leftIndex]).addClass('hover');
        $(leftSpans[leftIndex]).addClass('hover');
      }
      else if (rightIndex >= 0) {
        $(leftSpans[rightIndex]).addClass('hover');
        $(rightSpans[rightIndex]).addClass('hover');
      }
    }
  }
});

// 在正文有科判标记的span上鼠标滑入
$(document).on('mouseenter', '[ke-pan],p[id^=p]', function (e) {
  const cell = e.target.closest('.cell'),
      m = cell && /cell-(\d+)/.exec(cell.className),
      colTitle = m && $(`.cell-${m[1]} [title]`).attr('title');
  showKePanPath(getKePanId(e.target), colTitle);
});

// 在正文有科判标记的span上鼠标滑出
$(document).on('mouseleave', '[ke-pan]', function (e) {
  let kePanId = $('[ke-pan].active').attr('ke-pan');
  if (kePanId) {
    showKePanPath(kePanId);
  }
});

// 在正文有科判标记的span、科判条目上点击
$(document).on('click', '[ke-pan],.ke-line,p[id^=p]', function (e) {
  highlightKePan(getKePanId(e.target), 'click');
});

$('.ke-pan-ratio a').on('click', function () {
  setKePanWidth($(this).text());
});

$('#show-line-no').click(toggleLineNo);
$('.hide-xu').click(() => toggleXu(true));
$('#show-box').click(toggleParaBox);

$('#show-hide-txt').click(function() {
  $('body').toggleClass('show-hide-txt');
  $(this).closest('li').toggleClass('active');
});

$('#hide-navbar').click(function () {
  $('body').toggleClass('hide-navbar');
  cbOptions.hideNavbar = !cbOptions.hideNavbar;
  saveCbOptions();
}).toggle(window.innerWidth > 768);
if (cbOptions.hideNavbar) $('body').toggleClass('hide-navbar');

function toggleColumn(index, save) {
  if (index >= 0) {
    const $cell = $(`.cell-${index},.original#body${index}`), visible = !$cell.is(':visible');
    $cell.toggle(100, null, visible);
    setTimeout(updateColumnStatus, 100);
    if (save) {
      cbOptions.colHide = cbOptions.colHide || {};
      cbOptions.colHide['' + index] = !visible;
      saveCbOptions();
    }
  }
}

$('.toggle-column > button').click(function () {
  const text = $(this).text(), idx = parseInt(text) - 1;

  if (text === '序') {
    return toggleXu(true);
  } else {
     toggleColumn(idx, true);
  }
});

$('#show-left').click(showLeftColumn);
$('#show-right').click(showRightColumn);
$('#show-both').click(showTwoColumns);

$('#enlarge-font').click(enlargeFont);
$('#reduce-font').click(reduceFont);
$('#enlarge-ke-pan-font').click(enlargeKePanFont);
$('#reduce-ke-pan-font').click(reduceKePanFont);
$('#show-inline-no-ke-pan').click(showInlineWithoutKePan);

$('.show-inline-ke-pan-btn').click(function () {
  const hide = !$('body').hasClass('hide-inline-ke-pan');
  $('body').toggleClass('hide-inline-ke-pan', hide);
  $('.show-inline-ke-pan-btn').toggleClass('active', !hide)
      .closest('li').toggleClass('active', !hide);
  cbOptions.hideInlineKePan = hide;
  saveCbOptions();
});

// 单击注解锚点标记则展开注解段落
$(document).on('click', '.note-tag', function (e) {
  const $this = $(e.target),
      id = $this.attr('data-nid'),
      $p = $(`.note-p[data-nid=${id}]`),
      show = !$this.hasClass('note-expanded');

  if (!$p.length) {
    console.warn(id + ' note-p not exist');
  }
  if (show) {
    $p.insertAfter($this.closest('.lg').length ? $this.closest('.lg') : $this.closest('[ke-pan],p'));
  }
  $p.toggle(100, null, show);
  $(`.note-tag[data-nid=${id}]`).toggleClass('note-expanded', show);
  $(`note[data-nid=${id}]`).toggleClass('note-expanded', show);
  e.stopPropagation();
});

function toggleNoteP(e) {
  const $p = $(e.target).closest('.note-p'),
      id = $p.attr('data-nid'),
      $tag = $(`.note-tag[data-nid=${id}]`);

  $p.toggle(100);
  $tag.toggleClass('note-expanded');
  $(`note[data-nid=${id}]`).toggleClass('note-expanded', $tag.hasClass('note-expanded'));
  e.stopPropagation();
}

// 双击注解段落则收起隐藏
$(document).on('dblclick', '.note-p', toggleNoteP);
$(document).on('click', '.note-p .note-from', toggleNoteP);

// 单击 … 展开文字
$(document).on('click', '.more', function (e) {
  let $s = $(e.target);
  $s.text($s.text() === '…' ? $s.attr('data-more') : '…');
});

// 显隐全部注解
$('#show-notes').click(function() {
  const $tag = $('.note-tag'), expanded = $('.note-tag.note-expanded').length;
  if ($tag.length) {
    $('.note-p').toggle(!expanded);
    $tag.toggleClass('note-expanded', !expanded);
    $('.note-expanded').toggleClass('note-expanded', !expanded);
    $(this).closest('li').toggleClass('active', !expanded);
  }
});

$.fn.changeElementType = function(newType) {
  let newElements = [];
  $(this).each(function() {
    let attrs = {};
    $.each(this.attributes, function(idx, attr) {
      attrs[attr.nodeName] = attr.nodeValue;
    });
    let newElement = $("<" + newType + "/>", attrs).append($(this).contents());
    $(this).replaceWith(newElement);
    newElements.push(newElement);
  });
  return $(newElements);
};

// 转为多列表格以便复制到Word文档
$('#to-table').click(() => {
  if ($('#content table').length) {
    return;
  }
  $('#content').append($('<table><tbody></tbody></table>'));

  let $table = $('#content table'),
    $rows = $('#content > .row,#content > .ke-line'),
    visCols = getVisibleColumns().length,
    colCount = parseInt($('body').attr('data-col-count')) || 2,
    w = Math.floor(1000 / colCount) / 10;

  $rows.find('[ke-pan]').each((i, el) => {
    $(el).changeElementType('P');
  });
  $rows.each((i, el) => {
    const $tr = $('<tr/>');
    if (/ke-line/.test(el.className)) {
      const $td = $(el.outerHTML.replace(/^<div |<\/div>$/g, s => s.replace('div', 'td')));
      $tr.append($td.attr({colspan: visCols}));
    } else {
      for (let i = 0; i < colCount; i++) {
        const $td = $(`<td class="cell cell-${i}" width="${w}%"/>`).appendTo($tr);
        const $cell = $('.cell-' + i, el);
        $td.append($cell.html()).toggle($cell.is(':visible'));
      }
    }
    $table.append($tr);
    $(el).remove();
  });
});

initCbLiStatus();
