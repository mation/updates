const { DateTime } = require('luxon')

const { issuesByRange, reposByRange, enrichIssues, enrichRepos, ignoreProjects, ignoreBotUsers, enrichNLP, formatDigest } = require('./sources/github')
const { getVacays, formatVacays } = require('./sources/asana')
const { getJournals, formatJournals } = require('./sources/notion')
const { uploadMD } = require('./targets/slack')

const { ORG_TZ = 'America/Toronto' } = process.env
const stripMS = (dt) => `${dt.toISO().split('.')[0]}Z`


const weeklyDigest = async () => {
  const team = process.argv[2]
  // weekly range in ISO string but drops ms portion
  const today = DateTime.utc().startOf('day').setZone(ORG_TZ, { keepLocalTime: true })
  const yst = DateTime.utc().minus({ day: 1 }).setZone(ORG_TZ, { keepLocalTime: true })
  const lastYst = yst.minus({ week: 1 }).plus({ day: 1 })
  const start = stripMS(lastYst.startOf('day').toUTC())
  const end = stripMS(yst.endOf('day').toUTC())

  const [issues, repos, vacays, journals] = await Promise.all([
    issuesByRange({ start, end })
      .then((issues) => issues.filter(ignoreProjects))
      .then((issues) => issues.filter(ignoreBotUsers))
      .then((issues) => enrichIssues({ issues, start, end, team })),
    reposByRange({ start, end })
      .then((repos) => repos.filter(ignoreProjects))
      .then((repos) => enrichRepos({ repos, team })),
    getVacays({ after: lastYst.toISODate(), before: today.endOf('week').toISODate() }),
    getJournals({ start, end }),
  ])
  const enriched = await enrichNLP({ repos, ...issues, vacays, journals })
  const post = await formatDigest(enriched)
  const vPost = await formatVacays({ post, vacays })
  const md = await formatJournals({ post: vPost, journals })
  return uploadMD()(md)
}

if (require.main === module) {
  weeklyDigest().then(console.log).catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
