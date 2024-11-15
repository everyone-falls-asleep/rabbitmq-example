import express from "express";
import amqp from "amqplib";

const app = express();
const PORT = 3000;

// RabbitMQ connection settings
const RABBITMQ_URL = "amqp://localhost";
const QUEUE_NAME = "tasks";

let channel;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Initialize RabbitMQ connection and channel
async function initRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME);
    console.log("RabbitMQ channel initialized.");

    // Start consuming messages
    consumeMessages();
  } catch (error) {
    console.error("Failed to initialize RabbitMQ:", error);
    process.exit(1);
  }
}

// Add a message to the queue
app.post("/send", async (req, res) => {
  const { message } = req.body;

  try {
    if (!channel) throw new Error("RabbitMQ channel is not initialized.");

    // Send the message to the queue
    channel.sendToQueue(QUEUE_NAME, Buffer.from(message));
    console.log(`Message sent to queue: ${message}`);

    res.send(`
      <p>Message sent: "${message}"</p>
      <a href="/">Back</a>
    `);
  } catch (error) {
    console.error("Error sending message to queue:", error);
    res.status(500).send("Failed to send message.");
  }
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  initRabbitMQ();
});

// Consumer: Listen for messages in the queue
async function consumeMessages() {
  try {
    if (!channel) throw new Error("RabbitMQ channel is not initialized.");

    console.log("Waiting for messages...");

    // Consume messages from the queue
    channel.consume(QUEUE_NAME, (msg) => {
      if (msg !== null) {
        const message = msg.content.toString();
        console.log(`Received message: ${message}`);
        channel.ack(msg);

        // Broadcast received message to all clients via Server-Sent Events (SSE)
        broadcastMessage(message);
      }
    });
  } catch (error) {
    console.error("Error consuming messages:", error);
  }
}

// SSE (Server-Sent Events) setup
const clients = [];

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  clients.push(res);
  req.on("close", () => {
    clients.splice(clients.indexOf(res), 1);
  });
});

function broadcastMessage(message) {
  clients.forEach((client) => {
    client.write(`data: ${message}\n\n`);
  });
}
