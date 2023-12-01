const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.STRIPE_SECRITE_KEY);
const cookieParser = require('cookie-parser');


const port = process.env.PORT || 5000;

//CORS CONFIG FILE
const corsConfig = {
    origin: [
        'http://localhost:5173',
        'lowly-key.surge.sh',
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
};


// middleware
app.use(cors());
app.use(express.json());
app.use(cors(corsConfig));
app.use(cookieParser());
app.use(express.static("public"));

//MONGODB CONNECTION 
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}@cluster0.6kbuzrn.mongodb.net/?retryWrites=true&w=majority`;


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {
    try {

        // ALL DATABSE 
        const apartmentCollection = client.db("Haven").collection("apartment");
        const apartmentUserCollection = client.db("Haven").collection('user');
        const cuponCollection = client.db("Haven").collection('cupon');
        const memberRequestCollection = client.db("Haven").collection('membersRequest');
        const memberAnnouncementCollection = client.db("Haven").collection('announcement');
        const paymentReciveed = client.db("Haven").collection('payments');



        // JWT TOKEN CREATE 
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.JWT_ACCESS_TOKEN, { expiresIn: '1h' });
            res.send({ token });
        })

        // VERIFY TOKEN
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized access. Please try again.' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.JWT_ACCESS_TOKEN, function (err, decoded) {
                if (err) {
                    return res.status(403).send({ message: 'Unauthorized access. Please try again.' });
                }
                req.decoded = decoded;
                next();
            });
        };

        // GET ADMIN AND VERIFY ADMIN ROLL 
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const find = await apartmentUserCollection.findOne(query)
            let admin = false;
            if (find) {
                admin = find?.userStatus === 'admin'
            }
            res.send(admin)
        })

        // GET ADMIN AND VERIFY ADMIN ROLL 
        app.get('/users/member/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const find = await apartmentUserCollection.findOne(query)
            let member = false;
            if (find) {
                member = find?.userStatus === 'member'
            }
            res.send(member)
        })

        // STRIPE PAYMENT SYSTEM:
        app.post('/payment', async (req, res) => {
            const { price } = req.body;
            const money = parseInt(price * 100)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: money,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret,
            })
        })

        // all payments information 
        app.post('/paymentsInfo', async (req, res) => {
            const data = req.body;
            const result = await paymentReciveed.insertOne(data)
            res.send(result)
        })


        // QUEARY LINK
        // http://localhost:5000/paymentsInfo?month=April&user=taskinahmad@gmail.com
        app.get('/paymentsInfo', async (req, res) => {
            const user = req.query.user;
            const paymentMonth = req.query.month;
            if (user && paymentMonth) {
                const query = { email: user, paymentFor: paymentMonth };
                const result = await paymentReciveed.find(query).toArray();
                res.send(result);
            }
            else if (user) {
                const query = { email: user };
                const result = await paymentReciveed.find(query).toArray();
                res.send(result);
            } else if (paymentMonth) {
                const query = { paymentFor: paymentMonth };
                const result = await paymentReciveed.find(query).toArray();
                res.send(result);
            } else {
                const allPayments = await paymentReciveed.find().toArray();
                res.send(allPayments);
            }
        });

        // GET APEARMRNT DATA FROM DATABASE
        app.get('/apartmentData', async (req, res) => {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 6;
            const skip = (page - 1) * limit;
            const status = req.query.status;
            const filter = { status: status }
            try {
                const result = await apartmentCollection.find().toArray();
                const roomResult = await apartmentCollection.find(filter).toArray();
                const total = result.length;
                const availavailRooms = roomResult.length;
                const bookedRooms = total - availavailRooms;
                const allApartments = await apartmentCollection.find().skip(skip).limit(limit).toArray();
                res.json({ total, availavailRooms, bookedRooms, allApartments });
            } catch (error) {
                res.status(500).json({ message: error.message });
            }
        });
        app.get('/apartmentData/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await apartmentCollection.findOne(filter);
            res.send(result)
        })
        // create a new apartment 
        app.post('/apartmentData', verifyToken, async (req, res) => {
            const data = req.body;
            const result = await apartmentCollection.insertOne(data);
            res.send(result)
        })
        // update a  apaetment data 
        app.patch('/apartmentData/:id', verifyToken, async (req, res) => {
            const id = req.params.id;

            const filter = { _id: new ObjectId(id) };
            const data = req.body;
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    apartment_image: data.apartment_image,
                    drawing_room: data.drawing_room,
                    kitchen_room: data.kitchen_room,
                    wash_room: data.wash_room,
                    total_rooms: data.total_rooms,
                    rent: data.rent,
                    apartment_no: data.apartment_no,
                    block_name: data.block_name,
                    floor_no: data.floor_no,
                    status: data.status,
                },
            };
            const result = await apartmentCollection.updateOne(filter, updateDoc, options);
            res.send(result)
        })
        // delete a apartment data 
        app.delete('/apartmentData/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await apartmentCollection.deleteOne(filter);
            res.send(result);
        })


        //CREATE A USER
        app.post('/users', async (req, res) => {
            const user = req.body
            const query = { email: user.email }
            const isExist = await apartmentUserCollection.findOne(query)
            if (isExist) {
                return res.send({ message: 'User Allrady in Database', insertedId: null })
            }
            const result = await apartmentUserCollection.insertOne(user);
            res.send({ result, message: "User Added In Database" });
        })
        //FIND ALL USER LIST
        app.get('/users', verifyToken, async (req, res) => {
            const result = await apartmentUserCollection.find().toArray();
            res.send(result);
        });
        //FIND ALL USER LIST
        app.get('/users/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await apartmentUserCollection.findOne(filter);
            res.send(result);
        });
        // update a user
        app.patch('/users/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const newUserData = req.body;
            const filter = { email: email }
            const updateDoc = {
                $set: {
                    email: newUserData.email,
                    name: newUserData.name,
                    userStatus: newUserData.userStatus,
                },
            };
            const options = { upsert: true };
            const result = await apartmentUserCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })
        // update a user to member
        app.patch('/users/member/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const newUserData = req.body;
            const filter = { email: email }
            const updateDoc = {
                $set: {
                    email: newUserData.email,
                    name: newUserData.name,
                    userStatus: newUserData.userStatus,
                    apartment_image: newUserData.apartment_image,
                    apartment_no: newUserData.apartment_no,
                    block_name: newUserData.block_name,
                    drawing_room: newUserData.drawing_room,
                    floor_no: newUserData.floor_no,
                    kitchen_room: newUserData.kitchen_room,
                    rent: newUserData.rent,
                    total_rooms: newUserData.total_rooms,
                    userRequest: newUserData.userRequest,
                    wash_room: newUserData.wash_room,
                    accpetDate: newUserData.accpetDate

                },
            };
            const options = { upsert: true };
            const result = await apartmentUserCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })



        // GATE CUPON AND POST A CUPON
        app.post('/cupon', verifyToken, async (req, res) => {
            const data = req.body;
            const result = await cuponCollection.insertOne(data)
            res.send({ result, message: "User Added In Database" });
        })
        // GET CUPON DATA
        app.get('/cupon', async (req, res) => {
            const result = await cuponCollection.find().toArray();
            res.send(result);
        })
        // GET CUPON DATA BY ID
        app.get('/cupon/:id', async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const result = await cuponCollection.findOne(filter);
            res.send(result);
        })
        // UPDATE CUPPON 
        app.patch('/cupon/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const newData = req.body;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    user: newData.user,
                    cuponTitle: newData.cuponTitle,
                    feedback: newData.feedback,
                    CuponDescription: newData.CuponDescription,
                    cuponCard: newData.cuponCard,
                    percentage: newData.percentage,
                },
            };
            const result = await cuponCollection.updateOne(filter, updateDoc, options);
            res.send(result)

        })
        // DELETE CUPPON 
        app.delete('/cupon/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await cuponCollection.deleteOne(filter);
            res.send(result)

        })


        // member request 
        app.post('/memberRequest', verifyToken, async (req, res) => {
            const data = req.body;
            const result = await memberRequestCollection.insertOne(data);
            res.send(result);
        })
        //get member request 
        app.get('/memberRequest', verifyToken, async (req, res) => {
            const result = await memberRequestCollection.find().toArray();
            res.send(result);
        })
        //get a singel member request 
        app.get('/memberRequest/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const filter = { userEmail: email }
            const result = await memberRequestCollection.find(filter).toArray();
            res.send(result);
        })
        // delte a member request 
        app.delete('/memberRequest/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const filter = { userEmail: email }
            const result = await memberRequestCollection.deleteMany(filter);
            res.send(result);
        })


        // Announcement
        app.post('/announcement', verifyToken, async (req, res) => {
            const data = req.body;
            const result = await memberAnnouncementCollection.insertOne(data)
            res.send(result);
        })
        app.get('/announcement', async (req, res) => {
            const result = await memberAnnouncementCollection.find().toArray();
            res.send(result);
        })
        app.delete('/announcement/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const result = await memberAnnouncementCollection.deleteOne(filter);
            res.send(result);
        })

        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
    }
}
run().catch(console.dir);


// SERVER STARTING POINT 
app.get('/', (req, res) => {
    res.send('Assignment-12 Server Is Running')
})
app.listen(port, () => {
    console.log(`Assignment-12 Server Is Sitting On Port ${port}`);
})