// node domainParserTesting/domainParse.js domainParserTesting/domains.txt
var fs = require('fs');

srcAddr = String(process.argv[2]);

// get url list
fs.readFile(srcAddr, 'utf8', function (err,data) {
	if (err) {
		console.log("Bad file source address: " + srcAddr);
		return;
	}
	main(data);
});

function main(urlList){
	console.log("");
	urlArr = urlList.split("\n");
	for (i in urlArr){
		console.log(getDomain(urlArr[i]));
	}
}

function getDomain(url){
	return url;
}