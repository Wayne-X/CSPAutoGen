CSPAutoGen: on-the-fly CSP generator with flexible deployment.
Work done at Northwestern University under Professor Yan Chen
with wmcalyj and wayne-x. Adds better scraping and js based
template tools, relative to previous repo.

"EECS-495-CSP" contains Mengchao's scraping tools

"templateStage" contains Wayne's template creation/matching
tools

items in this directory contains integration of the two and
quickstart scripts

-- USAGE STEPS
1. start mongodb

mongod

2. start db server (in separate instance)

node EECS-495-CSP/CSP-Applier/training/db_server.js

3. crawl and scrape for scripts (in separate instance)
-- reads the URLs from sources.txt, crawls and scrapes
-- saves to mongodb
-- -- database: webcontents
-- -- collection: 

cd EECS-495-CSP && exec ./render_site.sh -f sources.txt -m 10

4. end crawling and scraping

cd EECS-495-CSP && exec ./stop_all.sh

5. begin script training
node templateStage/makeTemplate.js webcontents purescripts templates

6. 


