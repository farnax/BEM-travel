block('content').elem('offers')(
  tag()('ul'),
  content()(function() {
    return applyNext().map(function(item) {
      return {
        elem: 'item',
        content: [{
          elem: 'image',
          attrs: {'src': item.url}
        },
        {
          elem: 'title',
          content: item.title
        },
        {
          elem: 'info',
          content: item.info
        }]
        };
    });
  }),
  elem('item')({ tag: 'li' }),
  elem('image')({ tag: 'img' }),
  elem('title')({ tag: 'h3' }),
  elem('info')({ tag: 'p' })
);