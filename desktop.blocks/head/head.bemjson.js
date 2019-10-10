module.exports = {
  block: 'head',
  content: {
  	block: 'layout',
  	content: [{
  	  elem: 'left',
  	  content: [
  	    require('../authorization/authorization.bemjson.js')
  	  ]
  	},
  	{
  	  elem: 'right',
  	  content: [
  	    require('../social-network/social-network.bemjson.js')
  	  ]
  	}]
  }
};