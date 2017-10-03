# Paskto - Passive Web Scanner

  Paskto will passively scan the web using the Common Crawl internet index either by downloading the indexes on request or parsing data from your local system. URLs are then processed through Nikto and known URL lists to identify interesting content.                                                          

## Options

  -d, --dir-input directory   Directory with common crawl index files with .gz extension. Ex: -d "/tmp/cc/"
  -o, --output-file file      Save test results to file. Ex: -o /tmp/results.csv                            
  -u, --update-db             Build/Update Paskto DB from Nikto databases.                                  
  -n, --use-nikto             Use Nikto DBs. Default: true                                                  
  -e, --use-extras            Use EXTRAS DB. Default: true                                                  
  -s, --scan domain name      Domain to scan. Ex: -s "www.google.ca" or -s "*.google.ca"                    
  -i, --cc-index index        Common Crawl index for scan. Ex: -i "CC-MAIN-2017-34-index"                   
  -a, --save-all-urls file    Save CSV List of all URLS. Ex: -a /tmp/all_urls.csv                           
  -h, --help                  Print this usage guide.                                                       

## Examples

  Scan domain, save results and URLs   $ node paskto.js -s "www.msn.com" -o /tmp/test-results.csv -a /tmp/all-urls.csv                 
  Scan domain with CC wildcards.       $ node paskto.js -s "*.msn.com" -o /tmp/test-results.csv -a /tmp/all-urls.csv                   
  Scan domain, only save URLs.         $ node paskto.js -s "www.msn.com" -o /tmp/test-results.csv                                      
  Scan dir with indexes.               $ node paskto.js -d "/tmp/CC-MAIN-2017-39-index/" -o /tmp/test-results.csv -a /tmp/all-urls.csv

## News & Updates

Follow [@ThreatPinch](https://twitter.com/ThreatPinch) on twitter.

Make sure to check out [ThreatPinch Lookup](https://github.com/cloudtracer/ThreatPinchLookup) as well, our OSINT and Threat Intel Chrome / Firefox browser extension.
