module.exports = {
  block: 'page',
  title: 'Vayage',
  favicon: '/favicon.ico',
  head: [
    { elem: 'meta', attrs: { name: 'description', content: '' } },
    { elem: 'meta', attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1' } },
    { elem: 'css', url: 'index.min.css' },
    { elem: 'css', url: 'https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap'}
  ],
  scripts: [{ elem: 'js', url: 'index.min.js' }],
  content: [
      require('../../desktop.blocks/head/head.bemjson.js'),
      require('../../desktop.blocks/navigation/navigation.bemjson.js'),
      require('../../desktop.blocks/slider/slider.bemjson.js'),
      require('../../desktop.blocks/search-bar/search-bar.bemjson.js'),
      require('../../desktop.blocks/content/_type/content_type_offers.bemjson.js'),
      require('../../desktop.blocks/content/_type/content_type_holidays.bemjson.js'),
      require('../../desktop.blocks/content/_type/content_type_reviews.bemjson.js'),
      require('../..//desktop.blocks/footer/footer.bemjson.js')
  ]
};