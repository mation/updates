#!/usr/bin/env node
const { DateTime } = require('luxon')

const gh = require('./sources/github')
const asana = require('./sources/asana')
const notion = require('./sources/notion')
const slack = require('./targets/slack')

const { ORG_TZ = 'America/Toronto' } = process.env
const stripMS = (dt) => `${dt.toISO().split('.')[0]}Z`


const getDaily = async ({ date, raw = false, dryRun = false, timeZone = ORG_TZ }) => {
  // last work day in ISO string - ms portion
  const day = DateTime.fromISO(date).startOf('day').setZone(timeZone, { keepLocalTime: true })
  const lastYst = day.minus({ days: day.weekday === 1 ? 3 : 1 })
  const yst = day.minus({ day: 1 })
  const start = stripMS(lastYst.startOf('day').toUTC())
  const end = stripMS(yst.endOf('day').toUTC())

  const [issues, repos, vacays, journals] = await Promise.all([
    gh.issuesByRange({ start, end })
      .then((issues) => issues.filter(gh.ignoreProjects))
      .then((issues) => issues.filter(gh.ignoreBotUsers))
      .then((issues) => gh.enrichIssues({ issues, start, end, skipEnrichPRs: false, skipEnrichComments: false })),
    gh.reposByRange({ start, end })
      .then((issues) => issues.filter(gh.ignoreProjects))
      .then((repos) => gh.enrichRepos({ repos })),
    asana.getVacays({ after: day.toISODate(), before: day.endOf('week').toISODate() }),
    notion.getJournals({ start, end, isDaily: true }),
  ])
  const releases = await gh.api.getReleases({ repos, start, end })
  if (raw) {
    return JSON.stringify({ vacays, repos, releases, issues, journals })
  }
  const post = gh.formatPreviously({ repos, ...issues })
  gh.formatReleases({ post, releases, pre: true }) // mutates post.content with releases
  asana.formatVacays({ post, vacays, pre: true }) // mutates post.content with vacations
  notion.formatJournals({ post, journals }) // mutates post.content with journals
  if (dryRun) {
    return post
  }
  return slack.uploadMD(post)
}

const singleOptions = {
  date: {
    alias: 'd',
    type: 'string',
    default: new Date().toISOString(),
    description: 'Which date to retrieve the daily updates in ISO string format. Default now/today',
  },
  raw: {
    type: 'boolean',
    default: false,
    description: 'If true, output raw data as JSON without formatting as Slack post markdown',
  },
  'dry-run': {
    type: 'boolean',
    default: false,
    description: 'If true, output Slack Post markdown to stdout instead of posting to a designated Slack channel',
  },
  'time-zone': {
    type: 'string',
    default: ORG_TZ,
  },
}

require('yargs')
  .command(
    'daily',
    'daily updates',
    singleOptions, // builder options
    (args) => {
      getDaily(args).then(console.log).catch((e) => {
        console.error(e)
        process.exit(1)
      })
    },
  )
  .demandCommand()
  .help()
  .argv
