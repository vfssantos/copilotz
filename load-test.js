// Function to make one round of parallel requests
async function makeRequests(round) {
    const url = "http://localhost:8001/api/agents/functionCall";
    const data = {
      copilotzId: 1,
      input: "sim, por favor",
      user: {
        id: "user123",
        name: "John Doe"
      },
      thread: {
        extId: "thread456"
      }
    };
  
    const headers = {
      "Content-Type": "application/json"
    };
  
    // Array of parallel fetch requests
    const requests = Array.from({ length: 5 }, () =>
      fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(data)
      })
    );
  
    // Execute all requests in parallel
    console.log(`Starting round ${round}`);
    const responses = await Promise.all(requests);
  
    // Log response status for each request
    responses.forEach((response, i) => {
      console.log(`Request ${i + 1} in round ${round}: Status ${response.status}`);
    });
  }
  
  // Function to make Y rounds with X seconds interval
  async function makeRounds(x, y) {
    for (let i = 0; i < y; i++) {
      await makeRequests(i + 1);
      if (i < y - 1) {
        console.log(`Waiting for ${x} seconds before next round...`);
        await new Promise(resolve => setTimeout(resolve, x * 1000)); // Wait for X seconds
      }
    }
  }
  
  // Usage: X = interval in seconds, Y = number of rounds
  makeRounds(3, 2);