const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("fable_db");
    const ebooksCollection = db.collection("ebooks");
    const usersCollection = db.collection("user");
    const bookmarksCollection = db.collection("bookmarks");
    const paymentCollection = db.collection("payments");



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
      const ebooks = await ebooksCollection.find().skip(10).limit(6).toArray();
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
      const bookmark = req.body;
      const result = await bookmarksCollection.insertOne(bookmark);
      res.json(result);
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

    })

    app.get('/api/purchase/:id', async (req, res) => {

      const id = req.params.id;
      console.log(id);
      const query = {
        writerId: id
      }
      const purchases = await paymentCollection.find(query).toArray();

      if (purchases.length === 0) {
        return res.json([]);
      }
      
      res.json(purchases);

    })


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