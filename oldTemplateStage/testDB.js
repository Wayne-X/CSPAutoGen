var Db = require('mongodb').Db,
    MongoClient = require('mongodb').MongoClient,
    Server = require('mongodb').Server,
    ReplSetServers = require('mongodb').ReplSetServers,
    ObjectID = require('mongodb').ObjectID,
    Binary = require('mongodb').Binary,
    GridStore = require('mongodb').GridStore,
    Grid = require('mongodb').Grid,
    Code = require('mongodb').Code,
    // BSON = require('mongodb').pure().BSON,
    assert = require('assert');

console.log("connecting");

// Connect using the connection string
MongoClient.connect("mongodb://localhost:27017/web_contents", {native_parser:true}, function(err, db) {
	assert.equal(null, err);

	console.log("connected");
	mycollection = db.collection('jstest');
	mycollection.insert({
		"mystring": 	"myvalue1",
		"myarray": 		[1, 2, 3],
		"myobject": 	{this: "that", key: 2},
	});
	db.close();
});