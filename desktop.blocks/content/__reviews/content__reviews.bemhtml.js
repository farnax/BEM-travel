block('content').elem('reviews')(
  tag()('ul'),
  content()(function() {
    return applyNext().map(function(item) {
      return {
        elem: 'item',
        content: [{
          elem: 'review',
          content: item.review
        }, 
        {
          elem: 'client',
          content: item.client
        },
        {
          elem: 'location',
          content: item.location
        }]
      };
    });
  }),
  elem('item')({ tag: 'li' }),
  elem('review')({ tag: 'p' }),
  elem('client')({ tag: 'h3' }),
  elem('location')({ tag: 'h5' })
);