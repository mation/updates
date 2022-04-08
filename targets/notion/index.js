const { notion } = require('../../sources/notion/api')
const { mdNotionConverter } = require('./converter')


const { DATABASE_ID = 'adf0c7124e1e44ff851e254dbe36015c' } = process.env
const today = `${new Date().toISOString().split('T')[0]}`

module.exports.uploadMD = (post, tag) => notion.pages.create({
  parent: { type: 'database_id', database_id: DATABASE_ID },
  properties: {
    Digest: {
      title: [{
        text: { content: post.title },
      }],
    },
    Date: { type: 'date', date: { start: today } },
    Tags: { multi_select: [{ name: tag }] },
  },
  children: mdNotionConverter(post.content),
})
