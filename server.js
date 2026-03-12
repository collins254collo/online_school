const express = require('express');
const  PORT = process.env.PORT || 5000;


const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});