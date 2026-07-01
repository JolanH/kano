I want simple webapp with these features:

# Functional Requirements

## I - create a project containing a list of features :

- project = name + version
- each feature = name + description

## II - generate a poll link for a given project

poll ask 2 questions per feature:

- A (functional question) - how feel if feature present: answer = satisfaction level [ 1 - I love it; 2 - It is nice but expected; 3 - I am neutral; 4 - I dislike it but I can manage; 5 - I hate it ]
- B (dysfonctional question) - how feel if feature absent: answer = satisfaction level [ 1 - I love it; 2 - It is nice but expected; 3 - I am neutral; 4 - I dislike it but I can manage; 5 - I hate it ]

App store poll responses per response.

From answers, categorize each feature by A and B responses.
O
categories: Mandatory (M); Linear (L); Exciter (E); Indifferent (I); Contradictory (C); Doubtful (D);

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
> if response to A = 5 and B = 1		-> D;
>
> if response to A = 5 and B = 5		-> D;


Store feature category alongside poll response, so answer has 3 fields: FQ_ANSWER[1 to 5], QD_ANSWER[1 to 5], CATEGORY(M,L,E,I,C,D)

NB: must support many polls per project. Responses linked only to poll instance.


## III - Display analysis of a poll instance

Display poll instance analysis from current answers.

Want these visualizations:

### Features categorization

Per feature, show horizontal stacked bar = category repartition of poll instance answers for feature.

All features shown as list, stacked bar on right.

Dominant category shown on left, plus % value of category for feature.

### Categories visualization

Per feature category, show panel listing features where category dominant.

Each feature shown with % value of dominant category alongside.

# Technical requirements

## Architecture

Separate REST API + frontend.

Data storage = single node PostgreSQL instance.

Whole stack bootable via docker compose for local use.

## Languages and frameworks

Backend = python + Flask, use poetry for setup.

Frontend = vueJS 3, composition API.

## Testing & Logging

Backend needs integration tests covering all expected behavior.

Logging clear + explanatory on errors.