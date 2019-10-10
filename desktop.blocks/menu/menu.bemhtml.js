block('menu')(
  tag()('ul'),
  content()(function() {
    return applyNext().map(function(item) {
      return {
        elem: 'item',
        attrs: {'href': item.url},
        content:item.title
      };
    });
  }),
  block('menu')(
    tag()('nav')
  ),
  elem('item')(
    tag()('a')
  )
);
