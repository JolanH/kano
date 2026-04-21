I want to create a simple webapp, implementing the following functionalities :

# Functional Requirements

## I - create a project containing a list of features :

- project is composed of a name and a version
- each feature is composed of a name and a description

## II - generate a poll link for a given project

the poll should ask 2 questions for each feature of the project :

- A (functional question) - how do you feel if this feature is present in the product : answer is the satisfactio level [ 1 - I love it; 2 - It is nice but expected; 3 - I am neutral; 4 - I dislike it but I can manage; 5 - I hate it ]
- B (dysfonctional question) - how do you feel if this feature is absent from the product : answer is the satisfactio level [ 1 - I love it; 2 - It is nice but expected; 3 - I am neutral; 4 - I dislike it but I can manage; 5 - I hate it ]

The responses to the poll should be stored by the application for each poll response

Based on the poll's answers, we will categorize each feature according to responses to A and B

the categories are : Mandatory (M); Linear (L); Exciter (E); Indifferent (I); Contradictory (C); Doubtful (D);

> if response to A = 1 and B = 1 		-> D;
> 
> if response to A = 1 and B = 2,3,4 	-> E;
> 
> if response to A = 1 and B = 5 		-> L;
> 
> if response to A = 2,3,4 and B = 1	-> C;
> 
> if response to A = 5 and B = 2,3,4	-> C;
> 
> if response to A = 2,3,4 and B = 2,3,4	-> I;
> 
> if response to A = 2,3,4 and B = 5 	-> M;
> 
> if response to A = 5 and B = 5		-> D;


The resulting category of a feature should be stored alongside the poll response for this feature so that the poll answer will have 3 fields : FQ_ANSWER[1 to 5], QD_ANSWER[1 to 5], CATEGORY(M,L,E,I,C,D)

NB: it must be possible to generate several polls for the same project, the responses should be linked only to the poll instance


## III - Display analysis of a poll instance

We want to display the analysis of a poll instance, based on the answers provided at the moment

Here are the visualizations we want :

### Features categorization

for each feature, we want to display an horizontal stacked bar displaying the categories repartition of the poll instance answers for this feature

all features should be displayed as a list, with the stacked bar on the right

The dominant category should be displayed on the left, alongside with the % value of this category for this feature

### Categories visualization

For each feature category, we want to display a panel listing the features for which this category is dominant

Each feature should be displayed with the % value of its dominant category alongside

# Technical requirements

## Architecture

The application should be implemented with separate REST API and frontend

The data storage should be performed with a single node PostgreSQL instance

The whole stack should be bootable with docker compose for local use

## Languages and frameworks

The backend should be implemented in python with Flask framework, using poetry for project setup

The frontend should be implemented with vueJS 3, using composition API

## Testing & Logging

The backend should have integration tests covering all the expected behaviour

The logging should be clear and explanatory when there are errors





