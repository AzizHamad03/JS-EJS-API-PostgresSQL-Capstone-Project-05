CREATE TABLE bookslist (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  bookid VARCHAR(100) NOT NULL UNIQUE,
  cover VARCHAR(100),
  author VARCHAR(100),
  publishyear VARCHAR(100),
  avgrating numeric(10,2),
  numrating INT
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL
);


CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  bookkey VARCHAR(100) NOT NULL,
  userkey VARCHAR(100) NOT NULL,
  rating INT NOT NULL,
  reviewtitle VARCHAR(100) NOT NULL,
  body VARCHAR(10000),
  name VARCHAR(50),
  creationdate VARCHAR(100),
);

