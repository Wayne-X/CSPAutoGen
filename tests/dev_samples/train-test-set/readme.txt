script generator to generate training and testing scripts

call with:
node make_scripts.js [number of training scripts] [number of testing scripts to match] [number of testing scripts to fail]
node make_scripts.js 100 30 30
(will make 100 training scripts with 60 testing scripts to run, expecting 30 pass 30 fail)

makes train.txt test.txt with one script on each line
