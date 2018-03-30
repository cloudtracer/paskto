(
  function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
      define(factory);
    } else if (typeof exports === 'object') {
      module.exports = factory();
    } else {
      root.returnExports = factory();
    }
  }(this, function () {
    const get = require('simple-get');
    const fs = require('fs');
    const zlib = require('zlib');
    const base_path = __dirname;
    //view-source:https://InternetArchive.s3.amazonaws.com/cc-index/collections/index.html
    var InternetArchive = {};
    var QueryURL = "http://web.archive.org/cdx/search/cdx";
    var date = new Date().getFullYear();
    var prev = date -1;
    var nextYear = date +1;

    function WriteToGZFile(data, dir, filename){
      return new Promise((resolve, reject) => {
        var compress = zlib.createGzip();
        if (!fs.existsSync(dir)){
          fs.mkdirSync(dir);
        }
        var output = fs.createWriteStream(dir + filename);
        compress.pipe(output);
        compress.write(data);
        compress.end();
        compress.on('end', function(){
          resolve(dir+filename);
        }.bind(this));

      });
    }

    var FindByURL = function(options){
      return new Promise((resolve, reject) => {
        var page = options.page ? options.page : "0";
        var filename = options.queryString + "--" + page + ".gz";
        var dir = base_path +"/"+ "ia_files/" + options.currentIndex + "/";
        var createdUrl = QueryURL + '?url='+options.queryString +'&from='+prev+'&to='+nextYear+'&collapse=urlkey&page='+page;
        console.log("Downloading Internet Archive Index: " + createdUrl);
        if (fs.existsSync(dir+filename)) {
          console.log("Internet Archive Index file already exists: " + createdUrl + ", file: " + dir+filename);
          return resolve(dir+filename);
        }
        get({
          url: createdUrl,
          method: 'GET',
        }, function (err, res) {
          var results = "";
          if (err) {
            resolve(err);
          }
          if(res){
            res.on('data', function (chunk) {
              results+= chunk;
            })
            res.on('end', function(){
              WriteToGZFile(results, dir, filename).then(function(){
                resolve(dir+filename);
              });
            });
          } else {
            console.error("Result: " + res);
            console.error("Error: " + err);
            resolve(err);
          }
        });
      });
    }

    var PagesByURL = function(options){
      var createdUrl = QueryURL + '?url='+options.queryString +'&from='+prev+'&to='+nextYear+'&collapse=urlkey&showNumPages=true';
      try{
        var promise = new Promise((resolve, reject) => {
          get({
            url: createdUrl,
            method: 'GET',
          }, function (err, res) {
            var results = "";
            if (err) throw err
            res.setTimeout(120000);
            res.on('data', function (chunk) {
              results+= chunk;
            })
            res.on('end', function(){
              resolve(results);
            });
          })
        });
        return promise;
      } catch(error){
        console.error("ERROR: Could not resolve index request with URL: " + createdUrl);
        console.error(JSON.stringify(error));
        resolve(error);
      }
    }
    InternetArchive['PagesByURL'] = PagesByURL;
    InternetArchive['FindByURL'] = FindByURL;
    return InternetArchive;
  })
);
