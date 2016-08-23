var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var sha1 = require('sha1');
var bcrypt = require('bcrypt');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

app.use(session({
  secret: 'superSecret',
  resave: false,
  saveUninitialized: false,
  cookie: {}
}));

var restrict = function (req, res, next) {
  if (req.session.name) {
    return next();
  }
  res.redirect(301, '/login');
};

app.get('/', restrict,
function(req, res) {
  res.render('index');
});

app.get('/create', restrict,
function(req, res) {
  res.render('index');
});

app.get('/links', restrict,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links',
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login',
function(req, res) {
  res.render('login');
});

app.get('/signup', function (req, res) {
  res.render('signup');
});

app.post('/signup', function (req, res) {
  var username = req.body.username;
  var password = req.body.password;
  var salt = bcrypt.genSaltSync(10);
  var hash = bcrypt.hashSync(password, salt);

  new User({ username: username }).fetch().then(function(found) {
    if (found) {
      console.log('Username already exists.');
      res.redirect(201, '/login');
    } else {
      console.log('salt', salt);
      Users.create({
        username: username,
        password: hash,
        salt: salt
      })
      .then(function(newUser) {
        req.session.name = username;
        console.log('A new user is created', newUser.attributes);
        res.status(200).redirect('/');
      });
    }
  });
});

app.post('/login', 
function (req, res) {
  new User({ username: req.body.username }).fetch().then(function(user) {
    if (user) {
      console.log('user', user.attributes);
      console.log(req.body.password, user.attributes.salt);
      var hash = bcrypt.hashSync(req.body.password, user.attributes.salt);
      if (hash === user.attributes.password) {
        console.log('logging in');
        req.session.name = req.body.username;
        res.redirect('/');
      }
    } else {
      res.redirect('/login');
    }
  });
});

app.get('/logout', function (req, res) {
  res.redirect('/login');
  // req.session.destroy(function () {
  //   console.log('logging out');
  // });
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

app.post('/*', function(req, res) {
  res.redirect('/');
});

console.log('Shortly is listening on 4568');
app.listen(4568);
