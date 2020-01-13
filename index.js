"use strict";
require("shelljs/global");
const fs = require("fs");
const fsPromises = require("fs").promises;
const readFilesPromise = filenames => Promise.all(filenames.map(f => fsPromises.readFile(f)));
const path = require("path");
const JSON_EXT = ".report.json";

Array.prototype.sum = function() {
  return this.reduce(function (a, b) {
    return a + b;
  });
};

/**
 * @param {*} options cli arguments
 */
function execute(options) {
  log = log.bind(log, options.verbose || false);
  const out = `./report/lighthouse/${options.name}`;
  const lhScript = lighthouseScript(options, log);
  rm("-rf", out);
  mkdir("-p", out);

  const runLighthouse = run => {
    
    sitesInfo(options).map((site) => {
      const htmlOut = options.html ? " --output html" : "";
      const finalOutputFolder = path.join(out, String(run));
      mkdir("-p", finalOutputFolder);
      const filePath = path.join(finalOutputFolder, site.file);
      const customParams = options.params || "";
      const chromeFlags = customParams.indexOf("--chrome-flags=") === -1 ?`--chrome-flags="--no-sandbox --headless --disable-gpu"` :"";
      const outputPath = options.html ? filePath.slice(0, -JSON_EXT.length) :filePath;
      const cmd = `"${site.url}" --output json${htmlOut} --output-path "${outputPath}" ${chromeFlags} ${customParams}`;
      const outcome = exec(`${lhScript} ${cmd}`);
    });

  };
  
  // Run lighthouse for the specified number of runs
  for (let i = 0; i < options.runs; i++) {
    runLighthouse(i)
  }
  
  // Start Processing results
  processLighthouseOutput(options.name, options.runs);
}

/**
 * @param {*} name 
 * @param {*} runs 
 */
const processLighthouseOutput = (name, runs) => {

  const averages = [];
  const pathR = `./report/lighthouse/${name}/0/`;

  // get list of all the exported files under the first folder - we assume we have at least one 'run'
  fs.readdir(pathR, function (err, files) {
    files.forEach(function (file) {
      
      const fileNames = lighthouseOutputFilenames(runs, name, file);

      readFilesPromise(fileNames).then(fileList => {

          const summary = {
            url: "",
            performance: [],
            accessibility: [],
            bestPractices: [],
            seo: [],
            firstMeaningfulPaint: [],
            timeToInteractive: []
          };

          fileList.forEach((fileBuffer) => {
            const parsedFile = JSON.parse(fileBuffer.toString("utf-8"));
            summary.url = parsedFile.requestedUrl;
            summary.performance.push(parsedFile.categories.performance.score);
            summary.accessibility.push(parsedFile.categories.accessibility.score);
            summary.bestPractices.push(parsedFile.categories["best-practices"].score);
            summary.seo.push(parsedFile.categories.seo.score);
            summary.firstMeaningfulPaint.push(parsedFile.audits["first-meaningful-paint"].numericValue);
            summary.timeToInteractive.push(parsedFile.audits.interactive.numericValue);
          });

          const avg = {
            url: summary.url,
            performanceAvg: ((summary.performance.sum() / summary.performance.length)*100).toFixed(2),
            accessibilityAvg: ((summary.accessibility.sum() / summary.accessibility.length)*100).toFixed(2),
            bestPracticesAvg: ((summary.bestPractices.sum() / summary.bestPractices.length)*100).toFixed(2),
            seoAvg: ((summary.seo.sum() / summary.seo.length)*100).toFixed(2),
            firstMeaningfulPaintAvg: ((summary.firstMeaningfulPaint.sum() / summary.firstMeaningfulPaint.length)/1000).toFixed(2),
            timeToInteractiveAvg: ((summary.timeToInteractive.sum() / summary.timeToInteractive.length)/1000).toFixed(2)
          };
          
          averages.push(avg);

          // Save calculated summary
          saveSummary(name, averages);

        })
        .catch(console.log);
    });
  });
};

function lighthouseOutputFilenames(runs, name, file) {
  const fileNames = [];
  for (let i = 0; i < runs; i++) {
    fileNames.push(`./report/lighthouse/${name}/${i}/${file}`);
  }
  return fileNames;
}

/**
 * @param {*} name 
 * @param {*} averages 
 */
function saveSummary(name, averages) {
  const summaryPath = `./report/lighthouse/${name}/summary.json`;
  fs.writeFileSync(summaryPath, JSON.stringify(averages, null, 4));
}

function sitesInfo(options) {
  let sites = [];
  if (options.file) {
    try {
      const contents = fs.readFileSync(options.file, "utf8");
      sites = contents.trim().split("\n");
    } catch (e) {
      console.error(`Failed to read file ${options.file}, aborting.\n`, e);
      process.exit(1);
    }
  }
  if (options.sites) {
    sites = sites.concat(options.sites);
  }
  return sites.map(url => {
    url = url.trim();
    if (!url.match(/^https?:/)) {
      if (!url.startsWith("//")) url = `//${url}`;
      url = `https:${url}`;
    }
    const name = siteName(url);
    const info = {
      url,
      name,
      file: `${name}${JSON_EXT}`
    };
    return info;
  });
}

function lighthouseScript(options, log) {
  if (options.useGlobal) {
    if (exec("lighthouse --version").code === 0) {
      log("Targeting global install of Lighthouse cli");
      return "lighthouse";
    } else {
      console.warn(
        "Global Lighthouse install not found, falling back to local one"
      );
    }
  }
  let cliPath = path.resolve(
    `${__dirname}/node_modules/lighthouse/lighthouse-cli/index.js`
  );
  if (!fs.existsSync(cliPath)) {
    cliPath = path.resolve(
      `${__dirname}/../lighthouse/lighthouse-cli/index.js`
    );
    if (!fs.existsSync(cliPath)) {
      console.error(`Failed to find Lighthouse CLI, aborting.`);
      process.exit(1);
    }
  }
  log(`Targeting local Lighthouse cli at '${cliPath}'`);
  return `node ${cliPath}`;
}

function siteName(site) {
  return site.replace(/^https?:\/\//, "").replace(/[\/\?#:\*\$@\!\.]/g, "_");
}

function log(v, msg) {
  if (v) console.log(msg);
}

module.exports = execute;