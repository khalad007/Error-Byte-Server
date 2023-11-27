const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
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
        const paymentCollection = client.db("classDB").collection("payments");
        const myEnrollmentCollection = client.db("classDB").collection("myEnrollments");
        const teacherReqCollection = client.db("classDB").collection("teacherReqs");

        // jwt related api ........................................................................
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            })
            res.send({ token });
        })

        // middleware 
        const verifyToken = (req, res, next) => {
            console.log('inside verify ', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'UnAuthorized Access' });
            }
            const token = req.headers.authorization.split(' ')[1];

            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'UnAuthorized access ' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // verify admin 
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden Access' });

            }
            next();
        }

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
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        // admin check 
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden access ' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        // make admin 
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
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

        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { Price } = req.body;
            const amount = parseInt(Price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment api 
        //for transaction history

        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })

            }
           
            const result = await paymentCollection.find(query).toArray();
            res.send(result);

        })



        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);

            // Create enrollment items
            const enrollmentItems = payment.cartIds.map(id => ({
                classId: new ObjectId(id),
                userEmail: payment.email,
                // Add other necessary fields
            }));

            // Add data to the myEnrollmentCollection
            const addResult = await myEnrollmentCollection.insertMany(enrollmentItems);
          

            // Now delete payment items from the cartCollection
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            };
            const deleteResult = await cartCollection.deleteMany(query);

            res.send({ addResult, paymentResult, deleteResult });
        });

        //teacher 
        app.post('/teacherReq', async(req, res) => {
            const tReq = req.body;
            const result = await teacherReqCollection.insertOne(tReq);
            res.send(result)
        })

        // get all teacher req 
        app.get('/teacherReq',  async (req, res) => {
            const result = await teacherReqCollection.find().toArray();
            res.send(result);
        })

          // make teacher
          app.patch('/teacherReq/teacher/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'teacher'
                }
            }
            const result = await teacherReqCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })
          // reject teacher rquest
          app.patch('/teacherReq/teacherReject/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'reject'
                }
            }
            const result = await teacherReqCollection.updateOne(filter, updatedDoc)
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