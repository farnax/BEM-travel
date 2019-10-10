block('social-network')(
  tag()('ul'),
  content()(function() {
  	return applyNext().map(function(item) {
  	  return {
  	  	elem: 'item',
        elemMods: { icon: item.icon },
        attrs: {'href': item.url},
        mix: { block: 'link' }
  	  };
  	});
  }),
  elem('item')(
  	tag()('a')
  )
);
