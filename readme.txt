CSPAutoGen: on-the-fly CSP generator with flexible deployment.
Work done at Northwestern University under Professor Yan Chen
with wmcalyj and wayne-x. Adds better scraping and js based
template tools, relative to previous repo.

"EECS-495-CSP" contains Mengchao's scraping tools
"templateStage" contains Wayne's template creation/matching
tools

////////////////////////////////////// SETUP
Install the following: 
node.js
mongodb
node inspector
python

////////////////////////////////////// TRAINING
     1. start mongodb

sudo service mongodb stop
sudo mongod

     2. start db server (in separate terminal)

node EECS-495-CSP/CSP-Applier/training/db_server.js

     3. crawl and scrape for scripts (in separate instance)
     -- reads the URLs from sources.txt, crawls and scrapes
     -- saves to mongodb
     -- -- database: webcontents
     -- -- collection: purescripts

cd EECS-495-CSP && exec ./render_site.sh -f sources.txt -m 10

     4. end crawling and scraping

cd EECS-495-CSP && exec ./stop_all.sh
focus on db server terminal, ctrl+c

     5. begin script training

node templateStage/makeTemplate.js

////////////////////////////////////// MATCHING
     1. start mongodb

sudo service mongodb stop
sudo mongod

     2. start db server (in separate terminal)

node EECS-495-CSP/CSP-Applier/training/db_server.js

     3. crawl and scrape for scripts (in separate instance)
     -- reads the URLs from sources.txt, crawls and scrapes
     -- saves to mongodb
     -- -- database: webcontents
     -- -- collection: compareScripts

??? cd EECS-495-CSP && exec ./render_site.sh -f sources.txt -m 10
// todo, ask Mengchao to modify write collection

     4. end crawling and scraping

cd EECS-495-CSP && exec ./stop_all.sh
focus on db server terminal, ctrl+c

     5. match (by script or by collection)

node templateStage/ifMatch.js dbName collectionName domainName [script ObjectID]
node templateStage/ifMatch.js webcontents compareScripts cnn
node templateStage/ifMatch.js webcontents compareScripts cnn 56f2eea51cd7e16f99b900ee

