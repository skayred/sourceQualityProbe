const escomplex = require('typhonjs-escomplex');
const escomplexCoffee = require('escomplex-coffee');

const fs = require('fs');
const fileSystem = fs;
const glob = require('glob');
const childProcess = require('child_process');
const request = require('request');
const qs = require('qs');
const program = require('commander');

program
  .version('0.0.0')
  .option('-p, --path [path]', 'Project path')
  .option('-d, --dry', 'Dry run, data does not go anywhere')
  .option('-m, --min', 'Minimal mode, excludes all project info')
  .option('-H, --host [host]', 'API host')
  .option('-P, --port [port]', 'API port')
  .option('-T, --token [token]', 'API token')
  .option('-N, --probe [probe]', 'Probe ID')
  .parse(process.argv);

function submitProbeInfo(token, probeInfo, done) {
  var options = {
    url: 'http://' + program.host + ':' + program.port + '/api/probe_infos',
    method: "POST",
    headers: {
      'Content-type': 'application/x-www-form-urlencoded',
      'Authorization': 'Token token=' + token
    },
    body: qs.stringify({
      probe_id: program.probe,
      value: 0,
      params: probeInfo,
      quality_characteristics: [ 'performance' ]
    }, { arrayFormat: 'brackets' })
  };

  request(options, function(error, response, body) {
    done();
  });
}

glob('**/*.{js,jsx,ts,tsx,coffee}', {
    cwd: program.path,
    ignore: ["**/dist/**", "**/node_modules/**", "**/build/**", "**/spec/**", "**/docs/**", "**/doc/**", "**/debug/**", "**/tmp/**", "**/test/**"]
}, function(err, res) {
  if (err) throw err;

  var currentAmount = 0;
  var maintainability = 0;
  var modules = [];
  var loc = 0;

  var quality = res.forEach(function(filename) {
    try {
      var source = fs.readFileSync(program.path + '/' + filename, 'utf8');
      var v = filename.endsWith('coffee') ? escomplexCoffee.analyse(source, { newmi: true }) : escomplex.analyzeModule(source, { newmi: true });

      currentAmount += 1;
      maintainability = maintainability + (v['maintainability'] - maintainability)/(currentAmount + 1.0);
      loc += v['lineEnd'];

      modules.push({ name: filename, maintainability: v['maintainability'] });
    } catch (err) {
      return null;
    }
  });

  process.argv = ['', '', '--reporter=json-summary', 'npm', 'run', 'test'];
  process.chdir(program.path);
  const nyc = require('./nyc.js');
  nyc.onFinished = function(done) {
    var coverageLoc = 0;

    try {
      var reportJSON = JSON.parse(fs.readFileSync(process.cwd() + '/coverage/coverage-summary.json', 'utf8'));
      coverageLoc = loc * reportJSON['total']['lines']['pct'] / 100.0;
    } catch (err) {
      // Do nothing
    }

    revision = childProcess.execSync('git rev-parse HEAD')
                 .toString().trim()
    commitDate = childProcess.execSync('git log -1 --format=%cd').toString().trim()

    const probeInfo = {
      maintainability: maintainability,
      loc: program.min ? 0 : loc,
      coverage: program.min ? [] : coverageLoc,
      revision: revision,
      datetime: new Date(commitDate),
      modules: program.min ? [] : modules
    };

    if (program.dry) {
      console.log(JSON.stringify(probeInfo));
      done();
    } else {
      submitProbeInfo(program.token, probeInfo, done);
    }
  };
});
