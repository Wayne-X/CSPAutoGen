#!/bin/bash

# kill anything on localhost:27017 with 
# sudo netstat -tulpn | grep 27017
# kill [PID]

# begin port forwarding
ssh -L 27017:localhost:27017 csp_user@lotus.cs.northwestern.edu
