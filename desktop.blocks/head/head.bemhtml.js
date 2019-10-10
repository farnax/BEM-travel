block('head')(
  content()(() => {
  	return {
  	  elem: 'inner',
  	  content: applyNext()
  	};
  })
);