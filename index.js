const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const app = express()
const port = 8080

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Foo, Bar!')
})

const uri = process.env.MONGO_DB_URI;;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.FRONTEND_URL}/api/auth/jwks`)
  //   http://localhost:3000/api/auth/jwks
)

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("fable_db");
    const ebooksCollection = db.collection("ebooks");
    const usersCollection = db.collection("user");
    const bookmarksCollection = db.collection("bookmarks");
    const paymentCollection = db.collection("payments");
    const sessionCollection = db.collection('session');

    const verifyToken = async (req, res, next) => {

      const authHeader = req?.headers?.authorization;

      if (!authHeader) {
        return res.status(401).json({ message: 'unauthorized' })
      }
      const token = authHeader.split(" ")[1]
      if (!token) {
        return res.status(401).json({ message: 'unauthorized' })
      }
      console.log(token);

      try {
        const { payload } = await jwtVerify(token, JWKS)
        // console.log(payload);

        const userId = payload.id;

        const userQuery = {
          _id: new ObjectId(userId)
        }
        const user = await usersCollection.findOne(userQuery);
        if (!user) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        // set data in the req object
        req.user = user;
        next()
      } catch (error) {
        return res.status(403).json({ message: "Forbidden" })
      }

    }


    const verifyReader = async (req, res, next) => {
      if (req.user?.role !== 'reader') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }

    const verifyWriter = async (req, res, next) => {
      if (req.user?.role !== 'writer') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }

    // must be used after verifyToken middleware
    const verifyAdmin = async (req, res, next) => {
      if (req.user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }

    app.get('/api/ebooks', async (req, res) => {
      console.log('server side q', req.query)
      const query = {};

      // book filter related query
      if (req.query.search) {
        query.$or = [
          { title: { $regex: req.query.search, $options: 'i' } },
          { addedBy: { $regex: req.query.search, $options: 'i' } }
        ]
      }

      if (req.query.status) {
        query.status = req.query.status;
      }

      if (req.query.genre) {
        query.genre = req.query.genre
      }
      let sortOptions = {};
      if (req.query.sort === 'new') {
        sortOptions = { createdAt: -1 }; // -1 means Descending (Newest first)
      } else if (req.query.sort === 'old') {
        sortOptions = { createdAt: 1 };  // 1 means Ascending (Oldest first)
      }
      const cursor = ebooksCollection.find(query).sort(sortOptions);
      const ebooks = await cursor.toArray();
      res.json(ebooks);
    });


    app.get('/api/feat-ebooks', async (req, res) => {
      const query = { status: 'published' };
      const sortOptions = { createdAt: -1 };
      const ebooks = await ebooksCollection.find(query).sort(sortOptions).limit(6).toArray();
      res.json(ebooks);
    });

    app.get('/api/top-writers', async (req, res) => {
      const query = { role: "writer" };
      const writers = await usersCollection.find(query).limit(3).toArray();
      res.json(writers);
    });

    app.get('/api/writers', async (req, res) => {
      const query = { role: "writer" };
      const writers = await usersCollection.find(query).toArray();
      res.json(writers);
    });

    app.get('/api/users', async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.json(users);
    });

    app.post('/api/ebooks', async (req, res) => {
      const ebook = req.body;
      const newEbook = {
        ...ebook,
        createdAt: new Date()
      }
      const result = await ebooksCollection.insertOne(newEbook);
      res.json(result);
    });

    app.get('/api/ebooks/writer/:id', async (req, res) => {
      const writerId = req.params.id;
      const query = { addedBy: writerId };
      const ebooks = await ebooksCollection.find(query).toArray();
      res.json(ebooks);
    });

    app.get('/api/ebooks/:id', async (req, res) => {
      const ebookId = req.params.id;
      const query = { _id: new ObjectId(ebookId) };
      const ebook = await ebooksCollection.findOne(query);
      res.json(ebook);
    });

    app.patch('/api/ebooks/:id', async (req, res) => {
      const ebookId = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(ebookId) };
      const update = { $set: updatedData };
      const result = await ebooksCollection.updateOne(query, update);
      res.json(result);
    });

    app.post('/api/ebooks/bookmark', async (req, res) => {
      try {
        const bookmark = req.body;

        // 1. Check if THIS user already bookmarked THIS book
        const existing = await bookmarksCollection.findOne({
          user: bookmark.user,
          ebookId: bookmark.ebookId
        });

        if (existing) {
          // Return a clean JSON response instead of crashing
          return res.status(409).json({ error: true, message: "Already in bookmark" });
        }

        // 2. Insert if it doesn't exist
        const result = await bookmarksCollection.insertOne(bookmark);
        res.status(200).json(result);

      } catch (error) {
        console.error("Bookmark Error:", error);
        res.status(500).json({ error: true, message: "Internal server error" });
      }
    });

    app.get('/api/ebooks/bookmark/:userId', async (req, res) => {
      const userId = req.params.userId;
      const query = { user: userId };
      const bookmarks = await bookmarksCollection.find(query).toArray();
      res.json(bookmarks);
    });

    app.delete('/api/ebooks/:id', async (req, res) => {
      const ebookId = req.params.id;
      const query = { _id: new ObjectId(ebookId) };
      const result = await ebooksCollection.deleteOne(query);
      res.json(result);
    });

    app.post('/api/payments', async (req, res) => {
      const data = req.body;
      const paymentInfo = {
        ...data,
        createdAt: new Date()
      }

      const result = await paymentCollection.insertOne(paymentInfo);

      res.json(result);

    })

    app.get('/api/purchase/:id', async (req, res) => {
      try {
        const id = req.params.id;
        // console.log("Fetching purchases for:", id);

        const pipeline = [
          // match purchases where the user is either the buyer OR the writer
          {
            $match: {
              $or: [{ writerId: id }, { userId: id }]
            }
          },
          // convert the string writerId into a true ObjectId so it matches the user collection
          {
            $addFields: {
              writerObjectId: { $toObjectId: "$writerId" }
            }
          },
          // join with the "user" collection to get the writer's details
          {
            $lookup: {
              from: "user", // Make sure this perfectly matches your users collection name
              localField: "writerObjectId",
              foreignField: "_id",
              as: "writerDetails"
            }
          },
          // flatten the array that $lookup creates
          {
            $unwind: {
              path: "$writerDetails",
              preserveNullAndEmptyArrays: true // Keeps the purchase even if the writer was deleted
            }
          },
          // attach JUST the name to the root of the purchase object
          {
            $addFields: {
              writerName: "$writerDetails.name" // Assumes your user object has a 'name' field
            }
          },
          // 6. Clean up: remove the full user object so we don't accidentally leak passwords/emails
          {
            $project: {
              writerObjectId: 0,
              writerDetails: 0
            }
          }
        ];

        // Execute the pipeline
        const purchases = await paymentCollection.aggregate(pipeline).toArray();

        // Send the final data to the frontend
        res.json(purchases);

      } catch (error) {
        console.error("Error fetching purchases:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get('/api/revenue/:id', async (req, res) => {
      try {
        const writerId = req.params.id;
        // console.log("Calculating revenue for writer:", writerId);

        const result = await paymentCollection.aggregate([

          {
            $match: { writerId: writerId }
          },

          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: { $toDouble: "$ebookPrice" }
              }
            }
          }
        ]).toArray();

        const finalRevenue = result.length > 0 ? result[0].totalRevenue : 0;

        // Send it back as a JSON object
        res.json({ totalRevenue: finalRevenue });

      } catch (error) {
        console.error("Error calculating revenue:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.patch('/api/ebooks/status/:id', async (req, res) => {
      const ebookId = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(ebookId) };
      const update =
      {
        $set:
          { $status: updatedData.status }
      };
      const result = await ebooksCollection.updateOne(query, update);
      res.json(result);
    });

    app.get('/api/purchases/check', async (req, res) => {
      try {
        const { userId, ebookId } = req.query;

        if (!userId || !ebookId) {
          return res.status(400).json({ message: "userId and ebookId are required" });
        }

        const purchase = await paymentCollection.findOne({
          userId: userId,
          ebookId: ebookId
        });

        return res.status(200).json({ hasPurchased: !!purchase });

      } catch (error) {
        console.error("Error checking purchase status:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    });


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})