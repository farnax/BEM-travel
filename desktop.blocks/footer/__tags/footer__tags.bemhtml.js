block('footer').elem('tags')(
  tag()('ul'),
  content()(function() {
  	return applyNext().map(function(tag) {
  	  return {
  	  	elem: 'tag',
  	  	content: tag.tag
  	  }
  	});
  }),
  elem('tag')({ tag: 'li'})
);