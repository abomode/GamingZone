const bodyParser = require("body-parser");
var express = require("express");
var bcrypt = require('bcrypt');
const session = require('express-session');
var formidable = require("formidable");
var fs = require("fs");
var { getVideoDurationInSeconds } = require("get-video-duration");
var app = express();
app.use("/public", express.static(__dirname + "/public"));
app.use("/static", express.static(__dirname + "/static"));
app.set("view engine", "ejs");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


app.use(bodyParser.json({
    limit: "10000mb"
}))
app.use(bodyParser.urlencoded({
    extended: true,
    limit: "10000mb",
    parameterLimit: 1000000
}))

app.use(session({
    key: "user_id",
    secret: 'User secret Object Id',
    saveUninitialized: true,
    resave: true
}));


var mongodb = require("mongodb");
var MongoClient = mongodb.MongoClient;
var ObjectId = mongodb.ObjectId;

MongoClient.connect("mongodb://localhost:27017/", { useNewUrlParser: true },
    function (error, client) {
        var database = client.db("videostream");
        console.log("Db connected");


        // var http=require("http").createServer(app);
        // http.listen(1000,function(){
        //     console.log("server started");
        // })



        //a function to return user's document
        function getUser(id, callBack) {
            database.collection("users").findOne({
                "_id": ObjectId(id)
            }, function (error, user) {
                callBack(user);
            });
        }


        app.get('/', (req, res) => {
            database.collection("videos").find({}).sort({
                "createdAt": -1
            }).toArray(function (error, videos) {
                res.render("index", {
                    "isLogin": req.session.user_id ? true : false,
                    "videos": videos
                });
            });


        });

        app.get('/blog', (req, res) => {
            res.render("blog");
        });
        app.get('/callofDuty', (req, res) => {
            res.render("callofDuty");
        });app.get('/leagues', (req, res) => {
            res.render("leagues");
        });app.get('/popularity', (req, res) => {
            res.render("popularity");
        });app.get('/price', (req, res) => {
            res.render("price");
        });
        app.get('/new', (req, res) => {
            res.render("new");
        });


        app.get('/signup', (req, res) => {
            res.render("signup");
        });

        app.post("/signup", function (req, res) {
            database.collection("users").findOne({
                "email": req.body.email
            }, function (error, user) {
                if (user == null) {
                    //not exists

                    //convert pass into hash
                    bcrypt.hash(req.body.password, 10, function (error, hash) {
                        database.collection("users").insertOne({
                            "name": req.body.name,
                            "email": req.body.email,
                            "password": hash,
                            "subscribers": 0,
                            "subscriptions": [],
                            "playlists": [],
                            "videos": [],
                            "history": [],
                            "notifications": []
                        }, function (error, data) {
                            res.redirect("/login");
                        })
                    })
                } else {
                    //exists
                    res.send("email already exists");
                }
            });
        });


        app.get('/login', (req, res) => {
            res.render("login", {
                error: "",
                message: ""
            });
        });

        app.post("/login", function (req, res) {
            database.collection("users").findOne({
                "email": req.body.email
            }, function (error, user) {
                if (user == null) {
                    //not exists
                    res.send("email doesn't exists");
                } else {
                    //exists
                    bcrypt.compare(req.body.pass, user.password, function (error, isVerify) {
                        if (isVerify) {
                            //saving user id in session 
                            req.session.user_id = user._id;
                            res.redirect("/");
                        } else {
                            res.send("wrong password");
                        }
                    });
                }
            });
        });


        app.get("/logout", (req, res) => {
            req.session.destroy();
            res.redirect("/");
        });
        app.get("/upload", (req, res) => {
            if (req.session.user_id) {
                //page for upload
                res.render("upload", {
                    "isLogin": true
                });
            } else {
                res.redirect("/login");
            }
        });

        app.post("/upload-video", (req, res) => {
            //check user is logged in
            if (req.session.user_id) {
                var formData = new formidable.IncomingForm();
                formData.maxFileSize = 1000 * 1024 * 1024;
                formData.parse(req, (error, fields, files) => {
                    var title = fields.title;
                    var description = fields.description;
                    var tags = fields.tags;
                    var thumbnail = fields.thumbnail;
                    var category = fields.category;

                    var oldPaththumbnail = files.thumbnail.filepath;
                    var newPaththumbnail = "public/thumbnails/" + new Date().getTime() + "-" + files.thumbnail.originalFilename;
                    fs.rename(oldPaththumbnail, newPaththumbnail, (error) => {
                        //
                    });

                    var oldPathvideo = files.video.filepath;
                    var newPathvideo = "public/videos/" + new Date().getTime() + "-" + files.video.originalFilename;
                    fs.rename(oldPathvideo, newPathvideo, (error) => {
                        //console.log(error);  get user data to save in videos document
                        getUser(req.session.user_id, (user) => {
                            var currentTime = new Date().getTime();

                            //get video duration
                            getVideoDurationInSeconds(newPathvideo).then(function (duration) {
                                var hours = Math.floor(duration / 60 / 60);
                                var minutes = Math.floor(duration / 60) - (hours * 60);
                                var seconds = Math.floor(duration % 60);

                                //inserting in database
                                database.collection("videos").insertOne({
                                    "user": {
                                        "_id": user._id,
                                        "name": user.name,
                                        "subscribers": user.subscribers
                                    },
                                    "filePath": newPathvideo,
                                    "thumbnail": newPaththumbnail,
                                    "title": title,
                                    "descriptions": description,
                                    "tags": tags,
                                    "category": category,
                                    "createdAt": currentTime,
                                    "minutes": minutes,
                                    "seconds": seconds,
                                    "hours": hours,
                                    "views": 0,
                                    "watch": currentTime,
                                    "playlist": "",
                                    "likers": [],
                                    "dislikers": [],
                                    "comments": []
                                }, function (error, data) {
                                    //insertin in users collection too
                                    database.collection("users").updateOne({
                                        "_id": ObjectId(req.session.user_id)
                                    }, {
                                        $push: {
                                            "videos": {
                                                "_id": data.insertedId,
                                                "title": title,
                                                "views": 0,
                                                "thumbnail": thumbnail,
                                                "watch": currentTime
                                            }
                                        }
                                    });
                                    res.redirect("/");
                                });
                            });
                        });
                    });
                });
            } else {
                res.redirect("/login");
            }
        });

        app.get("/watch/:watch", function (req, res) {
            database.collection("videos").findOne({
                "watch": parseInt(req.params.watch)
            }, function (error, video) {
                if (video == null) {
                    res.send("Video does not exist");
                } else {
                    //video counter badhana
                    database.collection("videos").updateOne({
                        "_id": ObjectId(video._id)
                    }, {
                        $inc: {
                            "views": 1,
                        }
                    })


                    res.render("video-page/index", {
                        "isLogin": req.session.user_id ? true : false,
                        "video": video
                    });
                }
            });
        });

        //for searching
        app.post("/search", async (req, res) => {
            //console.log(req.body.search);
            await database.collection("videos").find({
                "$or": [
                    { "title": { $regex: req.body.search, $options: 'i' } },
                    { "tags": { $regex: req.body.search, $options: 'i' } },
                    { "category": { $regex: req.body.search, $options: 'i' } },
                    { "user.name": { $regex: req.body.search, $options: 'i' } }
                ]
            }).toArray(function (error, videos) {
                res.render("index", {
                    "isLogin": req.session.user_id ? true : false,
                    "videos": videos
                })
            })
        });

        app.post("/delete", (req, res) => {
            database.collection("videos").deleteOne({ "_id": ObjectId(req.body.deleteId) });
            res.redirect("/dashboard");
        });


        app.get("/dashboard", (req, res) => {

            database.collection("videos").find({
                "user._id": ObjectId(req.session.user_id)
            }).sort({
                "createdAt": -1
            }).toArray(function (error, videos) {
                getUser(req.session.user_id, (user) => {
                    database.collection("photos").findOne({
                        "user._id": ObjectId(req.session.user_id)
                    }, function (error, photo) {
                        res.render("dashboard", {
                            "isLogin": req.session.user_id ? true : false,
                            "user": user,
                            "videos": videos,
                            "photo": photo
                        })
                    })

                })

            });
        });

        app.get("/editProfile", (req, res) => {

            res.render("editProfile", {
                "isLogin": true
            });

        })

        app.post("/editProfile", (req, res) => {
            if (req.session.user_id) {
                var formData = new formidable.IncomingForm();
                formData.maxFileSize = 1000 * 1024 * 1024;
                formData.parse(req, (error, fields, files) => {

                    //var thumbnail=fields.thumbnail;
                    var oldPathcoverPhoto = files.coverPhoto.filepath;
                    var newPathcoverPhoto = "public/coverPhoto/" + new Date().getTime() + "-" + files.coverPhoto.originalFilename;
                    fs.rename(oldPathcoverPhoto, newPathcoverPhoto, (error) => {
                        //
                    });
                    var oldPathimage = files.image.filepath;
                    var newPathimage = "public/image/" + new Date().getTime() + "-" + files.image.originalFilename;
                    fs.rename(oldPathimage, newPathimage, (error) => {
                        getUser(req.session.user_id, (user) => {
                            var currentTime = new Date().getTime();
                            database.collection("photos").insertOne({
                                "user": {
                                    "_id": user._id,
                                    "name": user.name,
                                    "subscribers": user.subscribers
                                },
                                "coverPhoto": newPathcoverPhoto,
                                "image": newPathimage
                            });
                            res.redirect("/");
                        });
                    });
                })
            } else {
                res.redirect("/login");
            }
        })




        app.listen(8080, () => {
            console.log('listening at http://localhost:8080');
        });

    });