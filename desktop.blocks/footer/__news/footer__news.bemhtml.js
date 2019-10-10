block('footer').elem('news')(
  content()(function() {
  	return applyNext().map(function(latestNews) {
  	  return {
        elem: 'latestNews',
        content: [{
          elem: 'image',
          attrs: { 'src': latestNews.url }
        },
        {
          elem: 'info',
          content: latestNews.info
        },
        {
          elem: 'date',
          content: latestNews.date
        }]
      };
  	});
  }),
  elem('image')({ tag: 'img' }),
  elem('info')({ tag: 'p' }),
  elem('date')({ tag: 'p' })
);