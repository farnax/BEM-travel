block('content').elem('holidays')(
  content()(function() {
  	return applyNext().map(function(item) {
  	  return {
  	  	elem: 'item',
  	  	js: true,
  	  	content: {
  	  	  elem: 'title',
  	  	  content: item.title
  	  	}
  	  };
  	});
  }),
  elem('item')({ tag: 'div' })
);