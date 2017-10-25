const get = require('simple-get');
const zlib = require('zlib');
const readline = require('readline');
const fs = require('fs');
const cli_usage = require('command-line-usage');
const cli_args = require('command-line-args');

var common_crawl = require('./common_crawl.js');
var internet_archive = require('./internet_archive.js');

var nikto_db_vars_url = "https://raw.githubusercontent.com/sullo/nikto/master/program/databases/db_variables";
var nikto_db_tests_url = "https://raw.githubusercontent.com/sullo/nikto/master/program/databases/db_tests";

var columns = ["Test-ID", "OSVDB-ID", "Tuning Type", "URI", "HTTP Method", "Match 1", "Match 1 Or", "Match1 And", "Fail 1", "Fail 2", "Summary", "HTTP Data", "Headers"];

var nikto_db_vars = {};
var nikto_db_tests = {};

var test_names = {};
var db_hash = {};

var line_count = 0;

var cc_index = "CC-MAIN-2017-39-index";
var args;
var cwd = process.cwd();
var db = {};
var extras = require("./extras.json");
var digest_sigs = require("./digest_sigs.json");

var flag_use_extras = true;
var flag_use_nikto = true;
var flag_build_url_list = true;
var flag_update_nikto_db = false;

var results_write_stream;
var urls_write_stream;
var ia_results_write_stream;
var ia_urls_write_stream;

var option_list = [
  {
    name: 'dir-input',
    alias: 'd',
    type: String,
    typeLabel: '[underline]{directory}',
    description: 'Directory with common crawl index files with .gz extension. Ex: -d "/tmp/cc/"'
  },
  {
    name: 'ia-dir-input',
    alias: 'v',
    type: String,
    typeLabel: '[underline]{directory}',
    description: 'Directory with internet archive index files with .gz extension. Ex: -v "/tmp/ia/"'
  },
  {
    name: 'output-file',
    alias: 'o',
    type: String,
    typeLabel: '[underline]{file}',
    description: 'Save test results to file. Ex: -o /tmp/results.csv'
  },
  {
    name: 'update-db',
    alias: 'u',
    type: Boolean,
    description: 'Build/Update Paskto DB from Nikto databases.'
  },
  {
    name: 'use-nikto',
    alias: 'n',
    type: Boolean,
    description: 'Use Nikto DBs. Default: true'
  },
  {
    name: 'use-extras',
    alias: 'e',
    type: Boolean,
    description: 'Use EXTRAS DB. Default: true'
  },
  {
    name: 'scan',
    alias: 's',
    typeLabel: '[underline]{domain name}',
    type: String,
    description: 'Domain to scan. Ex: -s "www.google.ca" or -s "*.google.ca"'
  },
  {
    name: 'cc-index',
    alias: 'i',
    type: String,
    typeLabel: '[underline]{index}',
    description: 'Common Crawl index for scan. Ex: -i "CC-MAIN-2017-34-index"'
  },
  {
    name: 'save-all-urls',
    alias: 'a',
    type: String,
    typeLabel: '[underline]{file}',
    description: 'Save CSV List of all URLS. Ex: -a /tmp/all_urls.csv'
  },
  {
    name: 'help',
    alias: "h",
    type: Boolean,
    defaultOption: true,
    description: 'Print this usage guide.'
  }
];
//node paskto.js -s "*.msn.com" -o /tmp/test.csv -a /tmp/urls.csv
var sections = [
  {
    header: 'Paskto - Passive Web Scanner',
    content: 'Paskto will passively scan the web using the Common Crawl internet index either by downloading the indexes on request or parsing data from your local system. URLs are then processed through Nikto and known URL lists to identify interesting content.'
  },
  {
    header: 'Options',
    optionList: option_list
  },
  {
    header: 'Examples',
    content: [
      {
        desc: 'Scan domain, save results and URLs',
        example: '$ node paskto.js -s "www.msn.com" -o /tmp/rest-results.csv -a /tmp/all-urls.csv'
      },
      {
        desc: 'Scan domain with CC wildcards.',
        example: '$ node paskto.js -s "*.msn.com" -o /tmp/rest-results.csv -a /tmp/all-urls.csv'
      },
      {
        desc: 'Scan domain, only save URLs.',
        example: '$ node paskto.js -s "www.msn.com" -o /tmp/rest-results.csv'
      },
      {
        desc: 'Scan dir with indexes.',
        example: '$ node paskto.js -d "/tmp/CC-MAIN-2017-39-index/" -o /tmp/rest-results.csv -a /tmp/all-urls.csv'
      }
    ]
  },
  {
    content: 'Follow: @ThreatPinch for updates.'
  }
];

Promise.each = function(arr, fn) { // take an array and a function
  // invalid input
  if(!Array.isArray(arr)) return Promise.reject(new Error("Non array passed to each"));
  // empty case
  if(arr.length === 0) return Promise.resolve();
  return arr.reduce(function(prev, cur) {
    return prev.then(() => fn(cur))
  }, Promise.resolve());
}

function Main(){
  args = cli_args(option_list, { partial: true });
  const usage = cli_usage(sections);
  //console.log(args);
  if(args['help'] || Object.keys(args).length == 0 ){
    console.log(usage);
    return true;
  }

  if(args['update-db']){
    return BuildPaskoDB().then(function(){
      console.log("Paskto DB successfully updated.");
      return true;
    }).catch(function(error){
      console.log("ERROR: Could not update Paskto DB: " + JSON.stringify(error));
      return false;
    });
  }

  if (!fs.existsSync('./paskto_db.json')) {
      console.log("Paskto database does not exist, please run paskto --update-db");
      return false;
  } else {
    db = require('./paskto_db.json');
    test_names = Object.keys(db);
    DBToHash();
  }
  //ReadFile();
  //ReadDirectory('../../../all.com/');

  //ReadCompressedFile('../../../common-crawl/cdx-00000.gz')
  //ReadFullDirectoryCC('/media/brewerm/CommonCrawl/cc');
  if(args['save-all-urls']){
    if(fs.existsSync(args['save-all-urls'])){
      console.error("WARN: " + args['save-all-urls'] + " already exists, overwriting...");
      fs.unlinkSync(args['save-all-urls']);
    }
    urls_write_stream = require('fs').createWriteStream(args['save-all-urls'],{ flags:'a' });
    //ia_urls_write_stream = require('fs').createWriteStream(args['save-all-urls'] + "-IA",{ flags:'a' });
  }
  if(args['output-file']){
    if(fs.existsSync(args['output-file'])){
      console.warn("WARN: " + args['output-file'] + " already exists, overwriting...");
      fs.unlinkSync(args['output-file']);
    }
    results_write_stream = require('fs').createWriteStream(args['output-file'],{ flags:'a' });
    //ia_results_write_stream = require('fs').createWriteStream(args['output-file'] + "-IA",{ flags:'a' });
  }
  if(args['dir-input']){
    if(!args['output-file']){
      console.warn("WARN: Test results will not be saved, output csv file not set, use option -o /path/to/results_file.csv");
    }
    if(!args['save-all-urls']){
      console.warn("WARN: All URLS will not be saved, csv file not set, use option -a /path/to/url_file.csv");
    }
    if(!args['save-all-urls'] && !args['output-file']){
      console.error("ERROR: Either -o or -a must be set to either save results or all urls.");
      return false;
    }
    console.log("Reading directory: " + args['dir-input']);
    ReadFullDirectoryCC(args['dir-input']);
  }

  if(args['ia-dir-input']){
    if(!args['output-file']){
      console.warn("WARN: Test results will not be saved, output csv file not set, use option -o /path/to/results_file.csv");
    }
    if(!args['save-all-urls']){
      console.warn("WARN: All URLS will not be saved, csv file not set, use option -a /path/to/url_file.csv");
    }
    if(!args['save-all-urls'] && !args['output-file']){
      console.error("ERROR: Either -o or -a must be set to either save results or all urls.");
      return false;
    }
    console.log("Reading directory: " + args['ia-dir-input']);
    ReadFullDirectoryIA(args['ia-dir-input']);
  }
  if(args['cc-index']){
    cc_index = args['cc-index'];
  }
  if(args['use-nikto']){
    flag_use_nikto = args['use-nikto'];
  }
  if(args['use-extras']){
    flag_use_extras = args['use-extras'];
  }
  if(args['scan']){
    var promises = [];

    return common_crawl.PagesByURL({currentIndex: cc_index, queryString: args['scan']}).then(function(results){
      //console.log(results)
      var json = JSON.parse(results);
      var num_pages = json.pages;
      var params = [];
      console.log("INFO: Found " + num_pages + " pages of Common Crawl data.");
      for(var i=0; i<num_pages; i++){
        params.push({currentIndex: cc_index, queryString: args['scan'], page: i});
      }
      return Promise.each(params,function(eachArr){
        return common_crawl.FindByURL(eachArr);
      }).then(function(filepaths){
        console.log(filepaths);
        ProcessFilesSynchonouslyCC(filepaths, ReadCompressedFileCC)
      });
    }).then(function(){
      return internet_archive.PagesByURL({currentIndex: cc_index, queryString: args['scan']}).then(function(results){
        //console.log(results)
        //var json = JSON.parse(results);
        var num_pages = results.trim();
        var params = [];
        console.log("INFO: Found " + num_pages + " pages of Internet Archive data.");
        for(var i=0; i<num_pages; i++){
          params.push({currentIndex: cc_index, queryString: args['scan'], page: i});
          //console.log("Page: " + i);
        }
        return Promise.each(params,function(eachArr){
          return internet_archive.FindByURL(eachArr);
        }).then(function(filepaths){
          results_write_stream = require('fs').createWriteStream(args['output-file'],{ flags:'a' });
          urls_write_stream = require('fs').createWriteStream(args['save-all-urls'],{ flags:'a' });
          ProcessFilesSynchonouslyIA(filepaths, ReadCompressedFileIA)
        })
        //for(var i=0; i<num_pages; i++){
          //promises.push(internet_archive.FindByURL());
        //}
      });
    });
  }
}

function PerformIARequestSync(array, fn) {
    var index = 0;
    var filepaths = [];
    function next() {
        if (index < array.length) {
            var name = array[index];
            console.warn("Reading filename: " + name);
            fn(name).then(next);
            index++;
        } else {
          return filepaths;
        }
    }
    next();
}

function ReadFullDirectoryCC(dirname, output){
  //console.error("Reading Directory: " + dirname);
  fs.readdir(dirname, function(err, filenames) {
    if (err) {
      onError(err);
      return;
    }
    var filepaths = [];
    filenames.forEach(function(filename) {
      if(filename.indexOf('.gz') !== -1){
        //console.error("Getting filename: " + dirname + '/' + filename);
        filepaths.push(dirname + '/' + filename);
      }
    });
    ProcessFilesSynchonouslyCC(filepaths, ReadCompressedFileCC);
    //ProcessFilesSynchonouslyIA(filepaths, ReadCompressedFileIA)
  });
}

function ReadFullDirectoryIA(dirname, output){
  //console.error("Reading Directory: " + dirname);
  fs.readdir(dirname, function(err, filenames) {
    if (err) {
      onError(err);
      return;
    }
    var filepaths = [];
    filenames.forEach(function(filename) {
      if(filename.indexOf('.gz') !== -1){
        //console.error("Getting filename: " + dirname + '/' + filename);
        filepaths.push(dirname + '/' + filename);
      }
    });
    ProcessFilesSynchonouslyIA(filepaths, ReadCompressedFileIA);
    //ProcessFilesSynchonouslyIA(filepaths, ReadCompressedFileIA)
  });
}

function WriteToStream(line, stream){
  stream.write(line +"\n");

}

function ProcessFilesSynchonouslyCC(array, fn) {
    var index = 0;
    if(results_write_stream){
      WriteToStream('"' + "TEST_ID" + '", "' + "TEST_NAME" + '", "'  + "TRIGGER_PATH" + '", "' + "URL" + '", "'+ "HOST_NAME" + '", "'+ "DOMAIN" + '", "'+ "PROTOCOL" + '", "'+ "PORT" + '", "'+ "STATUS" + '", "' + "FILENAME" + '", "' + "HASH" + '"', results_write_stream);
    }
    if(urls_write_stream){
      WriteToStream('"' + "HTTP_CODE" + '", "' + "HASH" + '", "'  + "URL"  + '"', urls_write_stream);
    }
    function next() {
        if (index < array.length) {
            var name = "";
            if(typeof array === "string"){
              name = array;
              index = array.length;
            } else {
              name = array[index];
            }
            console.warn("Reading filename: " + name);
            fn(name).then(next);
            index++;
        } else {
          if(results_write_stream){
            results_write_stream.end();
            console.log("INFO: test results file located at - " + args['output-file']);
          }
          if(urls_write_stream){
            urls_write_stream.end();
            console.log("INFO: save-all-urls file located at - " + args['save-all-urls']);
          }
          console.log("INFO: Paskto successfully finished.")
        }
    }
    next();
}

function ProcessFilesSynchonouslyIA(array, fn) {
    var index = 0;
    if(results_write_stream && args['ia-dir-input']){
      WriteToStream('"' + "TEST_ID" + '", "' + "TEST_NAME" + '", "'  + "TRIGGER_PATH" + '", "' + "URL" + '", "'+ "HOST_NAME" + '", "'+ "DOMAIN" + '", "'+ "PROTOCOL" + '", "'+ "PORT" + '", "'+ "STATUS" + '", "' + "FILENAME" + '", "' + "HASH" + '"', results_write_stream);
    }
    if(urls_write_stream){
      //WriteToStream('"' + "HTTP_CODE" + '", "' + "HASH" + '", "' + "DATE" + '", "'  + "URL"  + '"', ia_urls_write_stream);
    }
    function next() {
        if (index < array.length) {
            var name = "";
            if(typeof array === "string"){
              name = array;
              index = array.length;
            } else {
              name = array[index];
            }
            console.warn("Reading filename: " + name);
            fn(name).then(next);
            index++;
        } else {
          if(results_write_stream){
            results_write_stream.end();
            console.log("INFO: test results file located at - " + args['output-file']);
          }
          if(ia_urls_write_stream){
            urls_write_stream.end();
            console.log("INFO: save-all-urls file located at - " + args['save-all-urls']);
          }
          console.log("INFO: Paskto successfully finished.")
        }
    }
    next();
}

function ReadCompressedFileCC(filename){
  try{
    return new Promise(function(resolve, reject) {
      if (!fs.existsSync(filename)) {
          console.log(filename+ ": does not exist.");
          return resolve();
      }
      var line_reader = readline.createInterface({
        input: fs.createReadStream(filename).pipe(zlib.createGunzip())
      });
      line_reader.on('line', function (line) {
        try{
          if(line[0] == "{"){
            var scan = JSON.parse(line);
            if(scan){
              PerformFastTests(scan.url, scan.status, scan.filename, scan.digest);
            }
            line_count++
          } else {
            var pos = line.indexOf(" {");
            if(pos !== -1){
              var trimmed = line.substring(pos, (line.length));
              var scan = JSON.parse(trimmed);
              if(scan){
                PerformFastTests(scan.url, scan.status, scan.filename, scan.digest);
              }
              line_count++
            }
          }

        } catch(error){
          console.error(line);
          console.error(error);
        }
      });
      line_reader.on('close', function(){
        console.error("File " + filename + " completed.");
        console.error("Lines read: " + line_count);
        resolve();
      });
    })

  } catch(error){
    console.error(filename);
    console.error(error);
    resolve(error);
  }
}

function ReadCompressedFileIA(filename){
  try{
    return new Promise(function(resolve, reject) {
      if (!fs.existsSync(filename)) {
          console.log(filename+ ": does not exist.");
          return resolve();
      }
      var line_reader = readline.createInterface({
        input: fs.createReadStream(filename).pipe(zlib.createGunzip())
      });
      line_reader.on('line', function (line) {
        try{
          var scan = line.split(" ");
          if(scan.length > 5){
            PerformFastTests(scan[2], scan[4], scan[1], scan[5]);
          }
          line_count++
        } catch(error){
          console.error(line);
          console.error(error);
        }
      });
      line_reader.on('close', function(){
        console.error("File " + filename + " completed.");
        console.error("Lines read: " + line_count);
        resolve();
      });
    })

  } catch(error){
    console.error(filename);
    console.error(error);
    resolve(error);
  }
}


String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};


function BuildPaskoDB(){
  return GetNiktoDBs().then(function(results){
    var vars = results.nikto_db_vars ? results.nikto_db_vars.split(/\r?\n/) : null;
    var tests = results.nikto_db_tests ? results.nikto_db_tests.split(/\r?\n/) : null;
    for(var i = 0, _len = vars.length; i< _len; i++){
      if(vars[i][0] !== "#"){
        var bits = vars[i].split("=");
        if(bits.length > 1){
          nikto_db_vars[bits[0]] = [];
          var arr = SplitBySpace(bits[1]);
          nikto_db_vars[bits[0]] = arr;
        }
      }
    }

    for(var i = 0, _len = tests.length; i< _len; i++){
      if(tests[i][0] !== "#"){
        var items = SplitByCSV(tests[i]);
        try{
          if(items.length == columns.length){
            var urls = ConvertVarsToURLs(items[3]);
            nikto_db_tests[items[0]] = {};
            nikto_db_tests[items[0]]["orig"] = items;
            nikto_db_tests[items[0]]["urls"] = urls;
          }
        } catch (error){
          //console.log(error);
        }

      }
    }
    fs.writeFile(__dirname + "/paskto_db.json", JSON.stringify(nikto_db_tests,null,2), function (err) {
        if (err)
            return console.log(err);
        console.log('INFO: Paskto database successfully updated.');
    });
    //console.log("nikto_db_tests: " + JSON.stringify(nikto_db_tests,null,2));
  });
}

function ReplaceVarInURL(url, old_var, new_var){
  return url.replaceAll(old_var, new_var);
}

function ConvertVarsToURLs(url){
  var urls_array = [];
  try{
    if(url.includes("@")){
      var var_names = Object.keys(nikto_db_vars);
      for(var i = 0, _len = var_names.length; i< _len; i++){
        if(url.includes(var_names[i])){
          if(typeof nikto_db_vars[var_names[i]] !== "string"){
            for(var x = 0, x_len = nikto_db_vars[var_names[i]].length; x < x_len; x++){
              var new_url = ReplaceVarInURL(url, var_names[i], nikto_db_vars[var_names[i]][x]);
              if(new_url.includes("@")){
                var new_arr = ConvertVarsToURLs(new_url);
                urls_array.concat(new_arr);
              } else {
                urls_array.push(new_url);
              }
            }
          } else {
            var new_url = ReplaceVarInURL(url, var_names[i], nikto_db_vars[var_names[i]]);
            urls_array.push(new_url);
          }
        }
      }
    } else {
      urls_array.push(url);
    }
  } catch(error){
    console.log(error);
  }
  return urls_array;
}


function SplitBySpace(string){
  var ret = string.split(/\s+/);
  return ret;
}

function SplitByCSV(string){
   var strings = string.split('","');
   var ret = [];
   for(var i = 0, _len = strings.length; i< _len; i++){
     ret.push(strings[i].replace('"', ''));
   }
   return ret;
}

function GetNiktoDBs(){
  var promises = [];
  promises.push(new Promise((resolve, reject) => {
      get({
        url: nikto_db_vars_url,
        method: 'GET',
      }, function (err, res) {
        var data = "";
        if (err) console.log(err);
        res.setTimeout(180000);
        res.on('data', function (chunk) {
          data += chunk;
        })
        res.on('end', function(){
          resolve(data);
        })
      });
    })
  );
  promises.push(new Promise((resolve, reject) => {
      get({
        url: nikto_db_tests_url,
        method: 'GET',
      }, function (err, res) {
        var data = "";
        if (err) console.log(err);
        res.setTimeout(180000);
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.on('end', function(){
          resolve(data);
        });
      });
    })
  );
  return Promise.all(promises).then(function(values){
    return {
      nikto_db_vars: values[0],
      nikto_db_tests: values[1]
    };
  });
}

//
function ExtractHostname(url) {
    var hostname;
    var protocol;
    var port;

    if (url.indexOf("://") > -1) {
        hostname = url.split('/')[2];
        protocol = url.split(':')[0];
    } else {
        hostname = url.split('/')[0];
    }

    var host_bits = hostname.split(':')
    hostname = host_bits[0];
    if(host_bits[1]){
      port = host_bits[1];
    } else {
      port = protocol;
    }

    hostname = hostname.split('?')[0];

    return {
      hostname: hostname,
      port: port,
      protocol: protocol
    };
}

function ExtractRootDomain(url) {
    var domain = ExtractHostname(url).hostname,
        split_array = domain.split('.'),
        len = split_array.length;
    if (len > 2) {
        domain = split_array[len - 2] + '.' + split_array[len - 1];
    }
    return domain;
}

function DBToHash(){
  for(var i=0, i_len = test_names.length; i< i_len; i++){
    for(var x=0, x_len = db[test_names[i]].urls.length; x< x_len; x++){
      if(db[test_names[i]].urls[x] != '/' && db[test_names[i]].urls[x] != '//'){
        if(!db_hash[db[test_names[i]].urls[x]]){
          db_hash[db[test_names[i]].urls[x]] = [];
        }
        toUnique(db_hash[db[test_names[i]].urls[x]].push(test_names[i]));
      }
    }
  }
}



function toUnique(a,b,c){
  //array,placeholder,placeholder
  b=a.length;
  while(c=--b)while(c--)a[b]!==a[c]||a.splice(c,1)
}

function PerformFastTests(url, status, filename, hash){
  var domain_bits = ExtractHostname(url);
  var hostname = domain_bits.hostname;
  var domain = ExtractRootDomain(url);

  var pos = url.indexOf(domain);
  var positive_tests = [];

  var extra_positive_tests = [];
  var total_length = pos + domain.length;
  var path = url.slice(total_length, (url.length));
  var bits = path.split('/');
  var new_path = "";
  var match_path = "";
  var nikto_match_path = "";
  if(urls_write_stream){
    WriteToStream('"' + status + '", "' + hash + '", "' + filename + '", "'  + url + '"', urls_write_stream);
  }
  //if(ia_urls_write_stream){
    //WriteToStream('"' + status + '", "' + hash + '", "' + filename + '", "'  + url + '"', ia_urls_write_stream);
  //}
  if(!results_write_stream) return true;
  for(var i_len=(bits.length-1); i_len > 0; i_len--){
    if(i_len == bits.length){
      new_path = "/" + bits[i_len];
    } else {
      new_path = "/" + bits[i_len] + new_path;
    }
    var has_tests;
    if(flag_use_nikto){
      has_tests = db_hash[new_path];

      if(has_tests){
        nikto_match_path =  "" + new_path;
        if(!positive_tests){
          positive_tests = has_tests;
        } else {
          positive_tests = positive_tests.concat(has_tests);
        }
      }
    }

    if(flag_use_extras){
      has_tests = extras[new_path];
      if(has_tests){
        match_path = "" + new_path;
        if(!extra_positive_tests){
          extra_positive_tests = has_tests;
        } else {
          extra_positive_tests = extra_positive_tests.concat(has_tests);
        }
      }
    }
  }


  if(digest_sigs[hash]){
    WriteToStream('"DIGEST_SIG-' + digest_sigs[hash].name + '", "' + 'DIGEST_SIG-' + digest_sigs[hash].name +"-"+ match_path  + '", "' + match_path + '", "' + url + '", "' + hostname + '", "' + domain + '", "' + domain_bits.protocol + '", "' + domain_bits.port + '", "' + status + '", "' +filename + '", "' + hash + '"', results_write_stream);
  }
  var tests_length = positive_tests.length;
  if(tests_length){
    for(var i=0, i_len=tests_length; i< i_len; i++){
      //WriteToStream('"NIKTO-' + positive_tests[i] + '", "' + db[positive_tests[i]].orig[10]  + '", "' + nikto_match_path + '", "' + url + '", "' + hostname + '", "' + domain + '", "' + domain_bits.protocol + '", "' + domain_bits.port + '", "' + status + '", "' +filename + '", "' + hash + '"', results_write_stream);
      WriteToStream('"NIKTO-' + positive_tests[i] + '", "' + db[positive_tests[i]].orig[10]  + '", "' + nikto_match_path + '", "' + url + '", "' + hostname + '", "' + domain + '", "' + domain_bits.protocol + '", "' + domain_bits.port + '", "' + status + '", "' +filename + '", "' + hash + '"', results_write_stream);

    }
  }

  if(flag_use_extras){
    tests_length = extra_positive_tests.length;
    if(tests_length){
      for(var i=0, i_len=tests_length; i< i_len; i++){
        //WriteToStream('"EXTRAS-' + extra_positive_tests[i] + '", "' + 'EXTRAS-' + extra_positive_tests[i]+"-"+ match_path  + '", "' + match_path + '", "' + url + '", "' + hostname + '", "' + domain + '", "' + domain_bits.protocol + '", "' + domain_bits.port + '", "' + status + '", "' +filename + '", "' + hash + '"', results_write_stream);
        WriteToStream('"EXTRAS-' + extra_positive_tests[i] + '", "' + 'EXTRAS-' + extra_positive_tests[i]+"-"+ match_path  + '", "' + match_path + '", "' + url + '", "' + hostname + '", "' + domain + '", "' + domain_bits.protocol + '", "' + domain_bits.port + '", "' + status + '", "' +filename + '", "' + hash + '"', results_write_stream);

      }
    }
  }
}

Main();
