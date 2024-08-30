import express from 'express';
import axios from "axios";
import bodyParser from 'body-parser';
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";

const app = express();
const port = 3000;

const saltRounds = 10;
env.config();

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24,
        }
    })
);


const API_URL = "https://openlibrary.org/search.json?";

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});
db.connect();

app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.render("index.ejs", { loggedIn: true });
    } else {
        res.render("index.ejs", { loggedIn: false });
    }
});

app.post('/', (req, res) => {
    res.redirect('/');
}
);
app.post('/booksResult', async (req, res) => {
    let covers_i = [];
    let titles = [];
    let authors_name = [];
    let first_publish_years = [];
    let keys = [];
    let ratings = [];
    let ratingsNumbers = [];
    let requestedBook = req.body.book;
    let book = requestedBook.replace(/ /g, "+");
    console.log(book);
    try {
        const result = await axios.get(API_URL + "q=" + book);
        const docs = result.data.docs;

        for (let i = 0; i < docs.length; i++) {
            if (i >= 15) {
                break; // Stop the loop when index reaches 15
            }
            covers_i.push(docs[i].cover_i); // Replace this with whatever you want to do with each item
            titles.push(docs[i].title);
            authors_name.push(docs[i].author_name);
            first_publish_years.push(docs[i].first_publish_year);
            keys.push(docs[i].key.split('/').pop());
            //new 
            const checkResult = await db.query("SELECT * FROM bookslist WHERE bookid = $1", [
                docs[i].key.split('/').pop(),
            ]);

            if (checkResult.rows.length > 0) {
                ///
            } else {

                db.query(
                    "INSERT INTO bookslist (title, bookid, cover, author, publishyear) VALUES ($1, $2, $3, $4, $5) RETURNING *",
                    [docs[i].title, docs[i].key.split('/').pop(), docs[i].cover_i, docs[i].author_name, docs[i].first_publish_year]
                );

            }//end

            const ratingResults = await db.query("SELECT * FROM reviews WHERE bookkey = $1", [docs[i].key.split('/').pop(),]);
            if (ratingResults.rows.length > 0) {
                let singleRating = 0;
                let ratingnumber = ratingResults.rows.length;
                ratingResults.rows.forEach(review => {
                    singleRating = singleRating + review.rating;
                });
                singleRating = singleRating / ratingnumber;
                ratings.push(singleRating);
                ratingsNumbers.push(ratingnumber);
                db.query(
                    "UPDATE bookslist SET avgrating = $1, numrating = $2 WHERE bookid = $3",
                    [singleRating, ratingnumber, docs[i].key.split('/').pop()]
                );

            } else {
                db.query(
                    "UPDATE bookslist SET avgrating = $1, numrating = $2 WHERE bookid = $3",
                    [0, 0, docs[i].key.split('/').pop()]
                );
                ratings.push(0);
                ratingsNumbers.push(0);
            }
        }
        res.render("booksResults.ejs", {
            titles: titles,
            covers_i: covers_i,
            authors_name: authors_name,
            first_publish_years: first_publish_years,
            keys: keys,
            ratings: ratings,
            ratingsNumbers: ratingsNumbers,
            loggedIn: req.isAuthenticated(),
        });
        console.log(covers_i);
        console.log(titles);
        console.log(authors_name);
        console.log(first_publish_years);
    } catch (error) {
        console.log("Catch error");
    }

});
app.post('/bookReview/:id', async (req, res) => {
    let key = req.body.book;
    try {
        const bookResult = await db.query("SELECT * FROM bookslist WHERE bookid = $1", [key]);
        const bookReview = await db.query("SELECT * FROM reviews WHERE bookkey = $1", [key]);

        let userReview = null;
        if (req.isAuthenticated()) {
            userReview = await db.query("SELECT * FROM reviews WHERE bookkey = $1 AND userkey = $2", [key, req.user.email]);
        }

        let cover = bookResult.rows[0].cover;
        let title = bookResult.rows[0].title;
        let author = bookResult.rows[0].author.replace(/[{"}]/g, '');
        let avgrating = bookResult.rows[0].avgrating;
        let numrating = bookResult.rows[0].numrating;
        let year = bookResult.rows[0].publishyear;

        res.render('bookReview.ejs', {
            title,
            cover,
            author,
            year,
            key,
            avgrating,
            numrating,
            reviews: bookReview.rows,
            userReview: userReview && userReview.rows.length > 0 ? "already added" : null,
            useremail: req.isAuthenticated() ? req.user.email : null,
            admin: process.env.ADMIN,
            loggedIn: req.isAuthenticated(),
        });
    } catch (error) {
        console.log("Catch error in posting book info", error);
    }
});

app.get('/bookReview/:id', async (req, res) => {
    const key = req.params.id;
    try {
        const bookResult = await db.query("SELECT * FROM bookslist WHERE bookid = $1", [key]);
        const bookReview = await db.query("SELECT * FROM reviews WHERE bookkey = $1", [key]);

        let userReview = null;
        if (req.isAuthenticated()) {
            userReview = await db.query("SELECT * FROM reviews WHERE bookkey = $1 AND userkey = $2", [key, req.user.email]);
        }

        if (bookResult.rows.length > 0) {
            let cover = bookResult.rows[0].cover;
            let title = bookResult.rows[0].title;
            let author = bookResult.rows[0].author.replace(/[{"}]/g, '');
            let avgrating = bookResult.rows[0].avgrating;
            let numrating = bookResult.rows[0].numrating;
            let year = bookResult.rows[0].publishyear;

            res.render('bookReview.ejs', {
                title,
                cover,
                author,
                year,
                key,
                avgrating,
                numrating,
                reviews: bookReview.rows,
                userReview: userReview && userReview.rows.length > 0 ? "already added" : null,
                useremail: req.isAuthenticated() ? req.user.email : null,
                admin: process.env.ADMIN,
                loggedIn: req.isAuthenticated(),
            });
        }
    } catch (error) {
        console.log("Catch error in getting book info", error);
    }
});

app.post("/rating", async (req, res) => {

    if (req.isAuthenticated()) {
        const key = req.body.key;
        console.log("the key in rating");
        console.log(key);
        console.log(req.user.name);
        try {
            const bookResult = await db.query("SELECT * FROM bookslist WHERE bookid = $1", [
                key,
            ]);
            let title = bookResult.rows[0].title;
            res.render("bookRating.ejs", {
                title: title,
                username: req.user.name,
                key: key,
                loggedIn: req.isAuthenticated(),
            });
        } catch (error) {

        }
    }
    else {
        // Redirect to login with the original rating URL as a query parameter
        res.redirect(`/login?redirect=/bookReview/${req.body.key}`);
    }


});
//
// GET route for /rating
app.get("/rating", async (req, res) => {
    if (req.isAuthenticated()) {
        const key = req.query.key;
        console.log("the key in rating (GET)");
        console.log(key);
        console.log(req.user.name);
        try {
            const bookResult = await db.query("SELECT * FROM bookslist WHERE bookid = $1", [
                key,
            ]);
            let title = bookResult.rows[0].title;
            res.render("bookRating.ejs", {
                title: title,
                username: req.user.name,
                key: key,
                loggedIn: req.isAuthenticated(),
            });
        } catch (error) {
            console.log("Error fetching book details:", error);
            res.redirect("/");
        }
    } else {
        // Redirect to login with the original rating URL as a query parameter
        res.redirect(`/login?redirect=/bookReview/${req.body.key}`);
    }
});
app.post("/finishRating", async (req, res) => {
    const date = new Date();
    const formattedDate = date.toLocaleString('en-US', { timeZoneName: 'short' });
    console.log(formattedDate);
    console.log(req.body);
    try {
        // Extract the review ID from the form data (or another identifier)
        const reviewId = req.body.reviewId;

        // Check if the review already exists
        const existingReviewResult = await db.query("SELECT * FROM reviews WHERE id = $1", [reviewId]);

        if (existingReviewResult.rows.length > 0) {
            // Update the existing review
            await db.query(
                "UPDATE reviews SET rating = $1, reviewtitle = $2, body = $3 WHERE id = $4",
                [req.body.rating, req.body.reviewTitle, req.body.body, reviewId]
            );
        } else {
            // Insert a new review if it does not exist
            await db.query(
                "INSERT INTO reviews (bookkey, userkey, rating, reviewtitle, body, name, creationdate) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
                [req.body.key, req.user.email, req.body.rating, req.body.reviewTitle, req.body.body, req.user.name, formattedDate]
            );
        }

        // Fetch the book details to update the average rating
        const bookResult = await db.query("SELECT * FROM bookslist WHERE bookid = $1", [req.body.key]);
        if (bookResult.rows.length > 0) {
            const currentAvgRating = bookResult.rows[0].avgrating || 0;
            const currentNumRating = bookResult.rows[0].numrating || 0;

            // Calculate the total rating points before updating
            const totalRatingPoints = currentAvgRating * currentNumRating;

            // Update the rating points
            const newTotalRatingPoints = totalRatingPoints + Number(req.body.rating) - (existingReviewResult.rows.length > 0 ? existingReviewResult.rows[0].rating : 0);

            // Update the number of ratings
            const newNumRating = currentNumRating + (existingReviewResult.rows.length > 0 ? 0 : 1);

            // Calculate the new average rating
            const newAvgRating = newTotalRatingPoints / newNumRating;

            // Update the book's average rating and number of ratings
            await db.query(
                "UPDATE bookslist SET avgrating = $1, numrating = $2 WHERE bookid = $3",
                [newAvgRating, newNumRating, req.body.key]
            );
        } else {
            console.log("Book not found in the bookslist table.");
        }
        if (req.query.redirect == "/yourReviews") {
            res.redirect("yourReviews");
        } else {
            res.redirect(`/bookReview/${req.body.key}`);

        }

    } catch (error) {
        console.log("Error in adding or updating review:", error.message);
        res.status(500).send("An error occurred while processing your review.");
    }
});



app.get("/login", (req, res) => {
    console.log("Redirecting to:", req.query.redirect);
    console.log("Book key:", req.query.key);
    res.render("login.ejs", {
        loggedIn: req.isAuthenticated(),
        redirect: req.query.redirect,
        key: req.query.key
    });
});

app.get("/signup", (req, res) => {
    res.render("signup.ejs", {
        loggedIn: req.isAuthenticated(),
        redirect: req.query.redirect,
        key: req.query.key
    });
});


app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) {
            return next(err);
        }
        res.redirect("/");
    });
});

app.post("/login", (req, res, next) => {
    passport.authenticate("local", function (err, user, info) {

        if (!user || err) {
            return res.render("login.ejs", {
                loggedIn: req.isAuthenticated(),
                redirect: req.query.redirect,
                key: req.query.key,
                errorMessage: "The email or password is incorrect." // Pass the error message
            });
        }
        req.logIn(user, function (err) {
            if (err) {
                return next(err);
            }
            const redirectUrl = req.query.redirect || '/';

            return res.redirect(redirectUrl);
        });
    })(req, res, next);
});

app.post("/signup", async (req, res) => {
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;

    try {
        const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);

        if (checkResult.rows.length > 0) {
            res.render("signup.ejs", {
                errorMessage: "The email is already registered.",
                loggedIn: req.isAuthenticated(),
                redirect: req.query.redirect,
                key: req.query.key
            });
        } else {
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    console.error("Error hashing password:", err);
                } else {
                    const result = await db.query(
                        "INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING *",
                        [email, hash, username]
                    );
                    const user = result.rows[0];
                    req.login(user, (err) => {
                        if (err) {
                            console.log(err);
                        } else {
                            const redirectUrl = req.query.redirect || '/';

                            res.redirect(redirectUrl);
                        }
                    });
                }
            });
        }
    } catch (err) {
        console.log(err);
    }
});

app.get("/yourReviews", async (req, res) => {
    let useremail = req.user.email;
    let books = [];
    let titles = [];
    let ratings = [];
    let bodies = [];
    let covers = [];
    let reviewIds = [];
    let creationdates = [];
    try {
        const userReviews = await db.query("SELECT * FROM reviews WHERE userkey = $1", [useremail]);
        if (userReviews.rows.length > 0) {
            for (let review of userReviews.rows) {  // Replaced forEach with for...of
                titles.push(review.reviewtitle);
                ratings.push(review.rating);
                reviewIds.push(review.id);
                bodies.push(review.body || "");
                creationdates.push(review.creationdate);

                // Query the bookslist table
                const bookResult = await db.query("SELECT * FROM bookslist WHERE bookid = $1", [review.bookkey]);

                if (bookResult.rows.length > 0) {  // Ensure the book was found
                    covers.push(bookResult.rows[0].cover);
                    books.push(bookResult.rows[0].title);
                } else {
                    covers.push(null); // Handle case where book isn't found
                    books.push("Unknown Title");
                }
                console.log(review.bookkey);
            }
            console.log(covers);
            console.log(books);
            res.render("yourReviews.ejs", {
                loggedIn: req.isAuthenticated(),
                books: books,
                titles: titles,
                ratings: ratings,
                bodies: bodies,
                covers: covers,
                reviewIds: reviewIds,
                creationdates: creationdates,
            });
        } else {
            res.render("yourReviews.ejs", {
                noReview: "You haven't added any reviews to any book...",
                loggedIn: req.isAuthenticated(),
            });
        }
    } catch (error) {
        console.log(error);
        res.render("yourReviews.ejs", {
            errorMessage: "An error occurred while retrieving your reviews.",
            loggedIn: req.isAuthenticated(),
        });
    }
});

app.get("/edit/:id", async (req, res) => {
    const reviewId = req.params.id;
    console.log(req.originalUrl);
    console.log(req.query.redirect);
    try {
        let reviewdetail = await db.query("SELECT * FROM reviews WHERE id = $1", [reviewId]);
        let bookkey = reviewdetail.rows[0].bookkey;
        let userkey = reviewdetail.rows[0].userkey;
        let rating = reviewdetail.rows[0].rating;
        let reviewTitle = reviewdetail.rows[0].reviewtitle;
        let body = reviewdetail.rows[0].body;
        let username = reviewdetail.rows[0].name;
        let bookdetails = await db.query("SELECT * FROM bookslist WHERE bookid = $1", [bookkey]);
        let title = bookdetails.rows[0].title;
        res.render("editReview.ejs", {
            reviewId: reviewId,
            bookkey: bookkey,
            userkey: userkey,
            rating: rating,
            reviewTitle: reviewTitle,
            body: body,
            username: username,
            title: title,
            redirect: req.query.redirect,
            loggedIn: req.isAuthenticated(),


        });
    } catch (error) {
        console.log(error.message);
    }
});

app.post("/delete/:id", async (req, res) => {
    const reviewId = req.params.id;

    try {
        // Get the book key and rating of the review to be deleted
        const reviewResult = await db.query("SELECT * FROM reviews WHERE id = $1", [reviewId]);
        if (reviewResult.rows.length > 0) {
            const bookKey = reviewResult.rows[0].bookkey;
            const ratingToRemove = reviewResult.rows[0].rating;

            // Delete the review
            await db.query("DELETE FROM reviews WHERE id = $1", [reviewId]);

            // Recalculate the book's average rating and number of ratings
            const ratingResults = await db.query("SELECT * FROM reviews WHERE bookkey = $1", [bookKey]);

            let newAvgRating = 0;
            let newNumRating = ratingResults.rows.length;

            if (newNumRating > 0) {
                let totalRating = 0;
                ratingResults.rows.forEach(review => {
                    totalRating += review.rating;
                });
                newAvgRating = totalRating / newNumRating;
            }

            // Update the book's average rating and number of ratings
            await db.query(
                "UPDATE bookslist SET avgrating = $1, numrating = $2 WHERE bookid = $3",
                [newAvgRating, newNumRating, bookKey]
            );

            // Redirect back to the reviews page
            if (req.body.redirect == "/yourReviews") {
                 res.redirect("/yourReviews");
                
            } else {
                res.redirect(`/bookReview/${bookKey}`);
            }
        } else {
            console.log("Review not found.");
            res.status(404).send("Review not found.");
        }
    } catch (error) {
        console.log("Error deleting review:", error.message);
        res.status(500).send("An error occurred while deleting the review.");
    }
});

//

passport.use(
    new Strategy(async function verify(username, password, cb) {
        try {
            const result = await db.query("SELECT * FROM users WHERE email = $1 ", [
                username,
            ]);
            if (result.rows.length > 0) {
                const user = result.rows[0];
                const storedHashedPassword = user.password;
                bcrypt.compare(password, storedHashedPassword, (err, valid) => {
                    if (err) {
                        //Error with password check
                        console.error("Error comparing passwords:", err);
                        return cb(err);
                    } else {
                        if (valid) {
                            //Passed password check
                            return cb(null, user);
                        } else {
                            //Did not pass password check
                            return cb(null, false);
                        }
                    }
                });
            } else {
                return cb("User not found");
            }
        } catch (err) {
            console.log(err);
        }
    })
);

passport.serializeUser((user, cb) => {
    cb(null, user);
});
passport.deserializeUser((user, cb) => {
    cb(null, user);
});




app.listen(port, () => {
    console.log(`Listening to Port ${port}.`);
});
