# BrotherEye

> Can you hear me, father [Bruce](<https://dc.fandom.com/wiki/Bruce_Wayne_(New_Earth)> "Bruce Wayne (New Earth)")? Eye am no longer a child. Eye have surpassed you, father. Eye have become a world unto myself.

-- BrotherEye (When it tries to rule Earth)

For now BrotherEye is a network monitoring solution tasked to keep tabs on users in the current network.

It is SNMP based meaning it uses snmp to try to guess as much about the network topology as possible without
going to LLDP or CDP as they are not as much supported in our current test enviroment.

## Technologies

This project was created using:

- Node.js
- TypeScript (then compiled into JS)
- MongoDB
- InfluxDB (as time-series database)

## Installation

Before installing, download and install [Node.js](https://nodejs.org/en/) 10.x or higher is required (for async/await).
A [MongoDB](https://www.mongodb.com/) instance should be running.
Also an [InfluxDB](https://www.influxdata.com/get-influxdb/) instance should be running.

After installing all the prerequisites do the following:

1.  `$ git clone https://github.com/ahmedHusseinF/brothereye`
2.  `$ npm install`
3.  `$ cp .env.example .env`
4.  Open `.env` and start configuring
5.  `$ npm start`
6.  Now there is a server running on your specified port with docs within `/docs`

## Limitations

We are trying to make this software as generalized as possible but due to current situations we are limited in access to big networks for proper testing.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Stopping Node.Js sessions
