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
    //view-source:https://commoncrawl.s3.amazonaws.com/cc-index/collections/index.html
    var CommonCrawl = {};
    var QueryURL = "http://index.commoncrawl.org/";
    var CurrentIndex = "CC-MAIN-2017-34-index";

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
        var dir = base_path +"/"+ "cc_files/" + options.currentIndex + "/";
        if (fs.existsSync(dir+filename)) {
          console.log("Common Crawl Index file already exists, URL: " + createdUrl + ", file: " + dir+filename);
          return resolve(dir+filename);
        }
        var createdUrl = QueryURL + options.currentIndex+ '?url='+options.queryString +'%2F*&output=json&page='+page;
        console.log("Downloading Common Crawl Index file, URL: " + createdUrl);
        get({
          url: createdUrl,
          method: 'GET',
        }, function (err, res) {
          var results = "";
          if (err) throw err
          res.setTimeout(1200000);
          res.on('data', function (chunk) {
            results+= chunk;
          })
          res.on('end', function(){
            WriteToGZFile(results, dir, filename).then(function(){
              resolve(dir+filename);
            });
          });
        });
      });
    }

    var PagesByURL = function(options){
      var createdUrl = QueryURL + options.currentIndex+ '?url='+options.queryString +'%2F*&output=json&showNumPages=true';
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
    CommonCrawl['PagesByURL'] = PagesByURL;
    CommonCrawl['FindByURL'] = FindByURL;
    return CommonCrawl;
  })
);
