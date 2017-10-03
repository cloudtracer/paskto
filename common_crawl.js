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
        } else {
          //console.log("Directory already exist");
        }
        var output = fs.createWriteStream(dir + filename);
        /* The following line will pipe everything written into compress to the file stream */
        compress.pipe(output);
        /* Since we're piped through the file stream, the following line will do:
           'Hello World!'->gzip compression->file which is the desired effect */
        compress.write(data);
        compress.end();
        compress.on('end', function(){
          //console.log("resolved")
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
          //console.log("file exists - resolved.");
          return resolve(dir+filename);
        }
        get({
          url: QueryURL + options.currentIndex+ '?url='+options.queryString +'%2F*&output=json&page='+page,
          method: 'GET',
        }, function (err, res) {
          var results = "";
          if (err) throw err
          res.setTimeout(1200000);
          res.on('data', function (chunk) {
            //console.log('Line: ' + chunk);
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
      //console.log(QueryURL + " " + options.currentIndex);
      var createdUrl = QueryURL + options.currentIndex+ '?url='+options.queryString +'%2F*&output=json&showNumPages=true';
      try{
        var promise = new Promise((resolve, reject) => {
          //console.log("url: " + createdUrl)
          get({
            url: createdUrl,
            method: 'GET',
          }, function (err, res) {
            var results = "";
            if (err) throw err
            res.setTimeout(120000);
            res.on('data', function (chunk) {
              //console.log('Line: ' + chunk)
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
