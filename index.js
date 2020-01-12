'use strict'
require('shelljs/global');
const fs = require('fs')
const path = require('path')
const JSON_EXT = '.report.json'
const HTML_EXT = '.report.html'

function execute(options) {
  log = log.bind(log, options.verbose || false)

  const out = `./report/lighthouse/${options.name}`
  const lhScript = lighthouseScript(options, log)
  
  rm('-rf', out)
  mkdir('-p', out)

  const runLighthouse = (run) => {

    const count = options.sites.length
    log(`Lighthouse batch run begin for ${count} site${count > 1 ? 's' : ''} current run is: ${run}`)
    
    sitesInfo(options).map((site, i) => {
        const prefix = `${i + 1}/${count}: `
        const htmlOut = options.html ? ' --output html' : ''
        const finalOutputFolder = path.join(out, String(run))
        mkdir('-p', finalOutputFolder)
        const filePath = path.join(finalOutputFolder, site.file)
        const customParams = options.params || ''
        const chromeFlags = customParams.indexOf('--chrome-flags=') === -1 ? `--chrome-flags="--no-sandbox --headless --disable-gpu"` : ''
        const outputPath = options.html ? filePath.slice(0, -JSON_EXT.length) : filePath
        const cmd = `"${site.url}" --output json${htmlOut} --output-path "${outputPath}" ${chromeFlags} ${customParams}`

        log(`${prefix}Lighthouse analyzing '${site.url}'`)
        log(cmd)
        
        const outcome = exec(`${lhScript} ${cmd}`)
    });

  };
  
  for(let i=0; i < options.runs; i++){
    runLighthouse(i)
  } 

  log(`Lighthouse batch run end`)
}

function sitesInfo(options) {
  let sites = []
  if (options.file) {
    try {
      const contents = fs.readFileSync(options.file, 'utf8')
      sites = contents.trim().split('\n')
    } catch (e) {
      console.error(`Failed to read file ${options.file}, aborting.\n`, e)
      process.exit(1)
    }
  }
  if (options.sites) {
    sites = sites.concat(options.sites)
  }
  return sites.map(url => {
    url = url.trim()
    if (!url.match(/^https?:/)) {
      if (!url.startsWith('//')) url = `//${url}`
      url = `https:${url}`
    }
    const name = siteName(url)
    const info = {
      url,
      name,
      file: `${name}${JSON_EXT}`
    }
    if (options.html) info.html = `${name}${HTML_EXT}`
    return info
  })
}

function lighthouseScript(options, log) {
  if (options.useGlobal) {
    if (exec('lighthouse --version').code === 0) {
      log('Targeting global install of Lighthouse cli')
      return 'lighthouse'
    } else {
      console.warn('Global Lighthouse install not found, falling back to local one')
    }
  }
  let cliPath = path.resolve(`${__dirname}/node_modules/lighthouse/lighthouse-cli/index.js`)
  if (!fs.existsSync(cliPath)) {
    cliPath = path.resolve(`${__dirname}/../lighthouse/lighthouse-cli/index.js`)
    if (!fs.existsSync(cliPath)) {
      console.error(`Failed to find Lighthouse CLI, aborting.`)
      process.exit(1)
    }
  }
  log(`Targeting local Lighthouse cli at '${cliPath}'`)
  return `node ${cliPath}`
}

function siteName(site) {
  return site.replace(/^https?:\/\//, '').replace(/[\/\?#:\*\$@\!\.]/g, '_')
}

function log(v, msg) {
  if (v) console.log(msg)
}

module.exports = execute;