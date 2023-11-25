const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000;

//middleware 
app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pcnyajy.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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

        const classesCollection = client.db("classDB").collection("classes");
        const userCollection = client.db("classDB").collection("users");
        const reviewCollection = client.db("classDB").collection("review");
        const cartCollection = client.db("classDB").collection("carts");

        // for popular classes (in home page)
        app.get('/classes', async (req, res) => {
            const result = await classesCollection.find().sort({ TotalEnrolment: -1 }).toArray();
            res.send(result);
        })
        // for review in home page 
        app.get('/review', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result)
        })
        // for all classes 
        app.get('/allClasses', async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result);
        })

        // for single class details 
        app.get('/allClasses/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }

            const options = {
                // Include only the `title` and `imdb` fields in the returned document
                projection: { Title: 1, Price: 1, Name: 1, Image: 1, TotalEnrolment: 1, ShortDescription: 1 },
            };

            const result = await classesCollection.findOne(query, options);
            res.send(result);
        })

        //cart collection 
        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result)
        })
        //carts collection single user dat a...............................................
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })

        // users related 
        // get all user  in admin dashboard
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        // make admin 
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        // for add user new user to db 
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
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


app.get('/', (req, res) => {
    res.send('server is runnign')
})

app.listen(port, () => {
    console.log(`Teacher is teaching on port ${port}`)
})