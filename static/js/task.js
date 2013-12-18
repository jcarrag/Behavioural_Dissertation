/*
 * Requires:
 *     psiturk.js
 *     utils.js
 */

// Initalize psiturk object
var psiTurk = PsiTurk();

// All pages to be loaded
var pages = [
	"instruct.html",
	"test.html",
	"postquestionnaire.html"
];

psiTurk.preloadPages(pages);



// Stimuli for a basic bandit experiment RAND INTS AND ASSIGN TO CARDS?
var data = {};


// Task object to keep track of the current phase
var currentview;


/********************
* HTML manipulation
*
* All HTML files in the templates directory are requested 
* from the server when the PsiTurk object is created above. We
* need code to get those pages from the PsiTurk object and 
* insert them into the document.
*
********************/


/*************************
* INSTRUCTIONS         
*************************/

var Instructions = function(pages) {
	var currentscreen = 0,
	    timestamp;
	    instruction_pages = pages; 
	
	var next = function() {
		psiTurk.showPage(instruction_pages[currentscreen]);
		$('.continue').click(function() {
			buttonPress();
		});
		
		currentscreen = currentscreen + 1;

		// Record the time that an instructions page is presented
		timestamp = new Date().getTime();
	};

	var buttonPress = function() {

		// Record the response time
		var rt = (new Date().getTime()) - timestamp;
		psiTurk.recordTrialData(["INSTRUCTIONS", currentscreen, rt]);

		if (currentscreen == instruction_pages.length) {
			finish();
		} else {
			next();
		}

	};

	var finish = function() {
		// Record that the user has finished the instructions and 
		// moved on to the experiment. This changes their status code
		// in the database.
		psiTurk.finishInstructions();

		// Move on to the experiment 
		currentview = new TestPhase();
	};

	next();
};



/********************
* BANDIT TEST       *
********************/

var TestPhase = function() {
    // Globals
    var cardSelected = false;
    var trial = 1;
    var maxTrial = 5;
    var condition= psiTurk.taskdata.get('condition');

    // Function to generate numbers, stored in data
    var genNumbers = function() {
        data[trial] = {};
        data[trial]['card1'] = Math.floor(Math.random()*51);
        data[trial]['card2'] = Math.floor(Math.random()*51);
        data[trial]['card3'] = Math.floor(Math.random()*51);
        data[trial]['card4'] = Math.floor(Math.random()*51);
        return data[trial];
    };

    // Function used to clear p tags to prevent cheating. Do not clear data entirely-
    // need record of previous trial for random walk
    var genBlanks = function() {
        data[trial] = {};
        data[trial]['card1'] = 0;
        data[trial]['card2'] = 0;
        data[trial]['card3'] = 0;
        data[trial]['card4'] = 0;
        return data;
    };

    // Function to set cards
    var setCards = function(values) {
        $('#1').html(values['card1']);
        $('#2').html(values['card2']);
        $('#3').html(values['card3']);
        $('#4').html(values['card4']);
    };

    var next = function() {

        // When a card is selected
        $('._card').click(function () {
            // Get value of selection and refresh
            if (cardSelected == false) {
                cardSelected = true;

                // Initialise cards
                data[trial] = genNumbers();
                setCards(data[trial]);

                // Show card picked
                var card = $(this).find('p', 'first');
                card.slideDown();

                // Record meta-information
                data[trial]['chosen_card'] = parseInt(card.attr('id'));
                data[trial]['chosen_value'] = parseInt($('#' + data[trial]['chosen_card']).html());
                data[trial]['max_value'] = Math.max(data[trial]['card1'], data[trial]['card2'], data[trial]['card3'], data[trial]['card4']);
                data[trial]['trialNumber'] = trial;
                data[trial]['condition'] = condition;

                // Note: timings are not additive: all absolute and begin at 0
                // Condition 0: unnecessary to code, (show card picked)
                // Condition 1: (show card picked) and max alternative, wait hiddenTime
                if (condition == 1) {
                    setTimeout(function() {
                        $('ul.list-unstyled li').html('The maximum from this trial was ' + data[trial]['max_value']).slideDown();
                    }, 1000);
                }
                // Condition 2: (show card picked) followed by all remaining, hidden cards. Wait hiddenTime
                else if (condition == 2) {
                    setTimeout(function() {
                        $('._card :hidden').slideDown();
                    }, 1000);
                }

                // Save data to psiTurk object
                trialSet = [];
                for (var x in data[trial]) {
                        trialSet.push(data[trial][x]);
                    }
                psiTurk.recordTrialData(trialSet);

                // Forgone code
                // Add delay to trials
                setTimeout(function () {

                    // REMOVE BEFORE GOING LIVE
                    // For testing- iterate through data and print to console OLD DATA
                    for (var x in data[trial]) {
                        console.log(x, data[trial][x])
                    }

                    // Re-hide all new cards and messages
                    $('._card p').hide();
                    $('ul.list-unstyled li').hide();

                    // Task finish condition
                    if (trial == maxTrial) {
                        psiTurk.saveData();
                        finish();
                    }

                    // Update trial number
                    trial++;

                    // Create and assign new card values, record prior trial for dynamic element
                    data[trial] = genBlanks();
                    setCards(data[trial]);

                    cardSelected = false;

                }, 3000);
            }
        });
    };

    var finish = function() {
		currentview = new Questionnaire();
	};

    // Load the test.html snippet into the body of the page
	psiTurk.showPage('test.html');

    // Start the test
	next();

};


/****************
* Questionnaire *
****************/

var Questionnaire = function() {

	var error_message = "<h1>Oops!</h1><p>Something went wrong submitting your HIT. This might happen if you lose your internet connection. Press the button to resubmit.</p><button id='resubmit'>Resubmit</button>";

	record_responses = function() {

		psiTurk.recordTrialData(['postquestionnaire', 'submit']);

		$('textarea').each( function(i, val) {
			psiTurk.recordUnstructuredData(this.id, this.value);
		});
		$('select').each( function(i, val) {
			psiTurk.recordUnstructuredData(this.id, this.value);		
		});

	};
	
	finish = function() {
		debriefing();
	};
	
	prompt_resubmit = function() {
		replaceBody(error_message);
		$("#resubmit").click(resubmit);
	};

	resubmit = function() {
		replaceBody("<h1>Trying to resubmit...</h1>");
		reprompt = setTimeout(prompt_resubmit, 10000);
		
		psiTurk.saveData({
			success: function() {
				clearInterval(reprompt); 
				finish();
			}, 
			error: prompt_resubmit}
		);
	};

	// Load the questionnaire snippet 
	psiTurk.showPage('postquestionnaire.html');
	psiTurk.recordTrialData(['postquestionnaire', 'begin']);
	
	$("#continue").click(function () {
		record_responses();
		psiTurk.teardownTask();
    	psiTurk.saveData({success: finish, error: prompt_resubmit});
	});
	
};


var debriefing = function() { window.location="/debrief?uniqueId=" + psiTurk.taskdata.id; };


/*******************
 * Run Task
 ******************/
$(window).load( function(){
    currentview = new Instructions([
		"instruct.html"
	]);
});

// vi: noexpandtab tabstop=4 shiftwidth=4
