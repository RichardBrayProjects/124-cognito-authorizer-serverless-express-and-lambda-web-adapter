#! /bin/bash

aws cloudformation      delete-stack          --stack-name "CDKToolkit" --region "eu-west-2" 
aws cloudformation      delete-stack          --stack-name "CDKToolkit" --region "us-east-1" 
./bootstrap-delete-buckets.sh 
./bootstrap-delete-containers.sh 