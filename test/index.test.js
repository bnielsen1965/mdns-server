const QueryName = 'mdns-server testing';
const QueryTimeout = 10000;
const MDNSServer = require('../index.js');
const chai = require('chai');
const expect = chai.expect;
chai.should();

describe('mdns-server', () => {
  it('Should find interfaces on host system', async () => {
    let result = await getAvailableInterfaces();
    expect(result).to.have.length.above(0);
  });

  it('Should receive query from any interface', async () => {
    let result = await queryAllInterfaces();
    expect(result).to.equal(true);
  });

  it('Should error ' + MDNSServer.ErrorMessages.NO_INTERFACES + ' with invalid interface', async () => {
    let error;
    try {
      await queryAnInterface('not an interface');
    } catch (e) {
      error = e.message;
    }
    expect(error).to.equal(MDNSServer.ErrorMessages.NO_INTERFACES);
  });

  it('Should receive response from any interface', async () => {
    let result = await respondAllInterfaces();
    expect(result).to.equal(true);
  });

  it('Should auto init a listening server and receive query', async () => {
    let result = await autoInitQueryAllInterfaces();
    expect(result).to.be.equal(true);
  });

  it('Should receive responses to queries', async () => {
    let result = await queryAndRespondAllInterfaces(true);
    expect(result).to.be.equal(true);
  });
});

function getAvailableInterfaces () {
  return new Promise((resolve, reject) => {
    let mdns = MDNSServer({
      reuseAddr: true, // in case other mdns service is running
      loopback: true, // receive our own mdns messages
      noInit: true // do not initialize on creation
    });
    resolve(mdns.getInterfaces());
    mdns.destroy();
  });
}

function autoInitQueryAllInterfaces () {
  return new Promise((resolve, reject) => {
    // create a server to listen for queries
    let mdns = MDNSServer({
      reuseAddr: true, // in case other mdns service is running
      loopback: true // receive our own mdns messages
    });
    let gotQuery = false;

    // create second server to send query
    let mdns2 = MDNSServer({
      reuseAddr: true, // in case other mdns service is running
      loopback: true, // receive our own mdns messages
      noInit: true // do not initialize on creation
    });

    mdns.on('error', error => {
      throw error;
    });

    mdns2.on('error', error => {
      throw error;
    });

    // listen for query events from server
    mdns.on('query', (query, rinfo) => {
      if (query.questions) {
        let names = query.questions.map(q => { return q.name; });
        if (!gotQuery && names.indexOf(QueryName) !== -1) {
          gotQuery = true;
          resolve(true);
          mdns.destroy();
          mdns2.destroy();
        }
      }
    });

    // query for all services on networks
    mdns2.on('ready', function () {
      mdns2.query({ questions: [{ name: QueryName, type: 'ANY' }] });
    });

    // initialize the server now that we are watching for events
    mdns2.initServer();

    // destroy the server after 10 seconds
    setTimeout(() => {
      reject(new Error('Timed out before receiving query'));
      mdns.destroy();
    }, QueryTimeout);
  });
}

// send and receive respond packet on all interfaces
function respondAllInterfaces () {
  return new Promise((resolve, reject) => {
    let mdns = MDNSServer({
      reuseAddr: true, // in case other mdns service is running
      loopback: true, // receive our own mdns messages
      noInit: true // do not initialize on creation
    });
    let gotResponse = false;

    mdns.on('error', error => {
      throw error;
    });

    // listen for query events from server
    mdns.on('response', (response, rinfo) => {
      if (response.answers) {
        let names = response.answers.map(a => { return a.name; });
        if (!gotResponse && names.indexOf(QueryName) !== -1) {
          gotResponse = true;
          resolve(true);
          mdns.destroy();
        }
      }
    });

    // query for all services on networks
    mdns.on('ready', function () {
      mdns.respond({
        answers: [
          { name: QueryName, type: 'SRV', data: { port: 9999, weight: 0, priority: 10, target: 'my-service.example.com' } },
          { name: QueryName, type: 'A', ttl: 300, data: '192.168.1.5' }
        ]
      });
    });

    // initialize the server now that we are watching for events
    mdns.initServer();

    // destroy the server after 10 seconds
    setTimeout(() => {
      reject(new Error('Timed out before receiving response'));
      mdns.destroy();
    }, QueryTimeout);
  });
}

// test to see if we get a query on any of our interfaces when we send a query with loopback true
function queryAndRespondAllInterfaces (useRinfo) {
  return new Promise((resolve, reject) => {
    let mdns = MDNSServer({
      reuseAddr: true, // in case other mdns service is running
      loopback: true, // receive our own mdns messages
      noInit: true // do not initialize on creation
    });
    let queryCount = 0;
    let responseCount = 0;

    mdns.on('error', error => {
      throw error;
    });

    // listen for query events from server
    mdns.on('response', (response, rinfo) => {
      if (response.answers) {
        let names = response.answers.map(a => { return a.name; });
        if (names.indexOf(QueryName) !== -1) {
          responseCount += 1;
        }
      }
    });

    // listen for query events from server
    mdns.on('query', (query, rinfo) => {
      if (query.questions) {
        let names = query.questions.map(q => { return q.name; });
        if (names.indexOf(QueryName) !== -1) {
          queryCount += 1;
          let answers = [{ name: QueryName, type: 'SRV', data: { port: 9999, weight: 0, priority: 10, target: 'my-service.example.com' } }];
          if (useRinfo) {
            mdns.respond(answers, rinfo);
          } else {
            mdns.respond(answers);
          }
        }
      }
    });

    // query for all services on networks
    mdns.on('ready', function () {
      mdns.query({ questions: [{ name: QueryName, type: 'ANY' }] });
    });

    // initialize the server now that we are watching for events
    mdns.initServer();

    // destroy the server after 10 seconds
    setTimeout(() => {
      if (responseCount >= queryCount) {
        resolve(true);
      } else {
        reject(new Error('Responses were less than queries'));
      }
      mdns.destroy();
    }, 5000);
  });
}

// test a query send on the specified interface
function queryAnInterface (iface) {
  return new Promise((resolve, reject) => {
    let mdns = MDNSServer({
      interfaces: [iface],
      reuseAddr: true, // in case other mdns service is running
      loopback: true, // receive our own mdns messages
      noInit: true // do not initialize on creation
    });
    let gotQuery = false;

    mdns.on('error', error => {
      throw error;
    });

    // listen for query events from server
    mdns.on('query', (query, rinfo) => {
      if (query.questions) {
        let names = query.questions.map(q => { return q.name; });
        if (!gotQuery && names.indexOf(QueryName) !== -1) {
          gotQuery = true;
          resolve(true);
          mdns.destroy();
        }
      }
    });

    // query for all services on networks
    mdns.on('ready', function () {
      mdns.query({ questions: [{ name: QueryName, type: 'ANY' }] });
    });

    // initialize the server now that we are watching for events
    mdns.initServer();

    // destroy the server after 10 seconds
    setTimeout(() => {
      reject(new Error('Timed out before receiving query'));
      mdns.destroy();
    }, QueryTimeout);
  });
}

// test to see if we get a query on any of our interfaces when we send a query with loopback true
function queryAllInterfaces () {
  return new Promise((resolve, reject) => {
    let mdns = MDNSServer({
      reuseAddr: true, // in case other mdns service is running
      loopback: true, // receive our own mdns messages
      noInit: true // do not initialize on creation
    });
    let gotQuery = false;

    mdns.on('error', error => {
      throw error;
    });

    // listen for query events from server
    mdns.on('query', (query, rinfo) => {
      if (query.questions) {
        let names = query.questions.map(q => { return q.name; });
        if (!gotQuery && names.indexOf(QueryName) !== -1) {
          gotQuery = true;
          resolve(true);
          mdns.destroy();
        }
      }
    });

    // query for all services on networks
    mdns.on('ready', function () {
      mdns.query({ questions: [{ name: QueryName, type: 'ANY' }] });
    });

    // initialize the server now that we are watching for events
    mdns.initServer();

    // destroy the server after 10 seconds
    setTimeout(() => {
      reject(new Error('Timed out before receiving query'));
      mdns.destroy();
    }, QueryTimeout);
  });
}
