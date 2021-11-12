const randomstring = require('randomstring');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const twilioAccountSID = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = require('twilio')(twilioAccountSID, twilioAuthToken);

const salesForceToken = process.env.SF_TOKEN;
const salesForceInstanceURI = process.env.SF_INSTANCE_URI;

const sendMessage = async (message, to) => {
    const prefix = '+44';
    try {
        const arr = await twilioClient.incomingPhoneNumbers.list({
            phoneNumber: prefix,
            limit: 4
        });
        let fromNumber = arr[Math.floor(Math.random() * arr.length)].phoneNumber;
        twilioClient.messages.create({
            from: fromNumber,
            to: to,
            body: message
        });
    } catch (error) {
        console.log(error);
    }
}

const statuses = {
    CREATED: 'Created',
    FULLFILLED: 'Processed',
    SHIPPED: 'Shipped',
    TRANSIT: 'In Transit',
    DELIVERED: 'Delivered'
}

const orders = [];

app.get('/orders', (req, resp) => {
    resp.type('application/json');
    resp.send(JSON.stringify(orders));
});

app.post('/orders', (req, resp) => {
    const orderId = rand();
    const customerSFId = (req.body.customerId === undefined) ? '0038d000001iZg4AAE' : req.body.customerId;
    const response = {
        "orderId": orderId,
        "status": statuses.CREATED
    };

    try{
        getContactFromSalesforce(customerSFId, (contact) => {
            let message = `Dear ${contact.name}. Your order was accepted. The order ID is ${orderId}.`;
            let fullfilment = {
                customer: contact,
                id: orderId,
                cart: req.body
            }
            orders.push(fullfilment);
            sendMessage(message, contact.phone);
        });
    }catch{
        console.error('Error occured while trying to call Salesforce');
    }

    resp.send(response);
});

app.put('/orders/:id/status', (req, resp) => {
    const orderId = req.params.id;
    const order = req.body.order;
    const status = order.status;
    let customerSFId = (order.customerId === undefined) ? '0038d000001iZg4AAE' : order.customerId;
    let message = '';

    if(statuses.FULLFILLED === status){
        message = `Your order ${orderId} was processed and Shippping label was created.`;
    }else if (statuses.SHIPPED === status) {
        message = `Your order ${orderId} has been shipped.`;
    } else if (statuses.TRANSIT === status) {
        message = `Your order ${orderId} is currently with our courier service.`;
    } else if (statuses.DELIVERED === status) {
        message = `Your order ${orderId} was delivered.`;
    }

    const response = {
        "orderId": orderId,
        "status": status,
        "message": message
    };

    try{
        getContactFromSalesforce(customerSFId, (contact) => {
            let sms = `Hi ${contact.name}. ${message}`;
            sendMessage(sms, contact.phone);
        });
    }catch{
        console.error('Error occured while trying to call Salesforce');
    }

    resp.send(response);
});

const rand = () => {
    const orderPrefix = randomstring.generate({
        length: 3,
        charset: 'alphabetic'
    });
    const orderNumber = randomstring.generate({
        length: 5,
        charset: 'numeric'
    });

    return `${orderPrefix.toUpperCase()}${orderNumber}`;
}

const getContactFromSalesforce = async (contactId, sendMessageHandler) => {

    let obj = {
        headers: {
            Authorization: `Bearer ${salesForceToken}`
        }
    }
    let url = `${salesForceInstanceURI}/sobjects/Contact/${contactId}`;
    let sfUser = await axios.get(url, obj)
        .then(function (response) {
            //can add a temporary state change on labels such as 'sending...'
            let user = {
                name: response.data.Name,
                address: response.data.MailingAddress,
                phone: response.data.Phone
            }
            return user;
        })
        .catch(function (error) {
            console.log(error);
            return error;
        });
        sendMessageHandler(sfUser);
    return sfUser;
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server started on port ${port} ...`);
});
