var alts = [];
var summary = {};
var currentView = 'cards';
var lastSortedColumn = null;
var lastSortDirection = 'asc';

$(document).ready(function() {
    var ajaxTime = Date.now();
    var secs = 0;
    var mins = 0;
    $('.load-timer').html(secs + 's');
    var maxWait = 15;

    // Timer and progress bar simulation
    var timer = setInterval(function () {
        secs = secs + 1;
        if (secs > 59) {
            mins = mins + 1;
            secs = 0;
        }
        if (mins < 1) {
            $('.load-timer').html(secs + 's');
        } else {
            $('.load-timer').html(mins + 'm' + ' ' + secs + 's');
        }

    },1000);

    // SSE for status updates
    if (!!window.EventSource) {
        var source = new EventSource('/updates');
        source.onmessage = function(e) {
            // Replace status with new message
            $('.status-updates').text(e.data);
        };
        source.onerror = function(e) {
            console.error("SSE error", e);
            source.close();
        };
    } else {
        console.log("Your browser doesn't support SSE.");
    }

    // AJAX call to get alts
    $.ajax({
        type: "POST",
        url: "/get_alts"
    })
    .done(function(response) {
        var totalTime = Date.now()-ajaxTime;
        // console.log("Total load time:", totalTime);

        // Request complete, finalize loader
        clearInterval(timer);
        $('.progress-bar').css('width', '100%');

        localStorage.clear();
        alts = response[0];
        summary = response[1];

        // Render cards initially
        renderCardView();

        $('#loader').fadeOut(1000).remove();
        $('.loader-content').hide();
        $('.main-content').show();

        // Sort functionality on dropdown change
        $('#sort-selector, #sort-direction').on('change', function() {
            var sortBy = $('#sort-selector').val();
            var direction = $('#sort-direction').val();
            sortAlts(sortBy, direction);
        });

        // Toggle view button
        // Starting in card view, show the table icon to switch to table view
        $('#toggle-view').html('<i class="fa-solid fa-list-ul"></i>');
        $('#toggle-view').on('click', function() {
            if (currentView === 'cards') {
                // Switch to table view
                currentView = 'table';
                // Replace icon with card icon to indicate toggling back
                $(this).html('<i class="fa-solid fa-table-cells"></i>');
                renderTableView();
            } else {
                // Switch to card view
                currentView = 'cards';
                // Replace icon with table icon to indicate toggling to table
                $(this).html('<i class="fa-solid fa-list-ul"></i>');
                renderCardView();
            }
        });


        $(document).on('click', '.icon', function(event) {
            // This prevents the click event from bubbling up to parent elements
            event.stopPropagation();            
            // Get the filter value from the clicked icon
            const altFilter = '.' + $(this).attr('data-filter');
        
            // Retrieve existing filters from localStorage or initialize an empty array
            let filters = JSON.parse(localStorage.getItem('altFilters')) || [];
        
            // Add or remove the clicked filter
            const filterIndex = filters.indexOf(altFilter);
            if (filterIndex === -1) {
                filters.push(altFilter); // Add filter if not present
            } else {
                filters.splice(filterIndex, 1); // Remove filter if already present
            }
        
            // Apply filters or show all articles if no filters remain
            if (filters.length > 0) {
                localStorage.setItem('altFilters', JSON.stringify(filters));
        
                // Build a compound selector for all active filters
                const compoundFilter = filters.join(',');
        
                // Show filtered elements with fadeIn, and hide non-matching elements
                $('#alts > article').each(function () {
                    const $article = $(this);
                    if ($article.is(compoundFilter)) {
                        $article.stop(true, true).fadeIn(2000); // Show with fade-in
                    } else {
                        $article.stop(true, true).fadeOut(200); // Hide quickly
                    }
                });
            } else {
                localStorage.removeItem('altFilters');
        
                // No filters active, show all articles with fadeIn
                $('#alts > article').stop(true, true).fadeIn(2000);
            }
        });
        
        // Default sort: by level desc, then by name asc on ties
        lastSortedColumn = 'level';
        lastSortDirection = 'desc';
        sortAlts('level', 'desc');
    });

    // Close modal logic
    $('.modal-close').on('click', function() {
        $('#modal-overlay').fadeOut();
    });

    // If you want to close the modal by clicking outside the modal window:
    $('#modal-overlay').on('click', function(e) {
        if (e.target === this) {
            $(this).fadeOut();
        }
    });

    // Open modal logic
    // Delegation used if .view-details-btn is dynamically added after AJAX calls
    $(document).on('click', '.view-alt-details', function() {
        const altName = $(this).data('alt-name');
        const altRealm = $(this).data('alt-realm');
    
        $('#modal-body').html('<p>Loading...</p>');
        $('#modal-overlay').fadeIn();
    
        // Update the AJAX call to send name and realm_slug instead of alt_id
        $.ajax({
            type: 'POST',
            url: '/get_alt_detail', // Your backend endpoint
            contentType: 'application/json',
            data: JSON.stringify({ 
                name: altName, 
                realm: altRealm 
            }),
            success: function(response) {
                $('#modal-body').html(response.html || 'No details available.');

                // 1. Find the <article> or container with a class name representing the class
                // e.g. <article class='alt-detail deathknight'>
                const $article = $('#modal-body').find('article.alt-detail');

                // 2. Extract the class name
                //    [0] might be 'alt-detail', [1] might be 'deathknight'
                let altClass = '';
                if ($article.length > 0) {
                    const classes = $article.attr('class').split(/\s+/);
                    altClass = classes.find(c => c !== 'alt-detail') || '';
                }

                if (altClass == 'rogue') {
                    const $img = $article.find('img.image-skew');
                    fadeInAndOutRandom($img); // start random fade cycle
                }
                // Suppose each time you open the modal:
                const existing = tsParticles.domItem(0); 
                // or tsParticles.dom().find(item => item.interactivity.element.id === "modal-particles")

                if (existing) {
                    existing.destroy(); // remove old particles instance
                }

                // 3. If we have a config for that class, load tsparticles; otherwise skip
                if (classParticleConfigs[altClass]) {
                    tsParticles.load("modal-particles", classParticleConfigs[altClass]);
                } else {
                    // No config for this class => do nothing or console.log
                    console.log(`No particle config found for class: ${altClass}`);
                }
            },
            error: function(xhr, status, error) {
                $('#modal-body').html('<p>Error loading details.</p>');
            }
        });
    });

  // Grab the tooltip container
  const tooltip = document.getElementById('tooltip');
  const tooltipContent = document.getElementById('tooltip-content');

  // Listen for mouseover on any element that has "data-tooltip"
  document.addEventListener('mouseover', function (e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
      // Get the HTML from data-tooltip
      const html = target.getAttribute('data-tooltip');
      // Insert that HTML into the tooltip container
      if (html != '') {
          tooltipContent.innerHTML = html;

          // Position the tooltip near the cursor
        tooltip.style.display = 'block';
        tooltip.style.left = (e.pageX + 15) + 'px';
        tooltip.style.top = (e.pageY + 15) + 'px';
      } else {
        tooltip.style.display = 'none';
        tooltipContent.innerHTML = '';
      }
    } else {
      // If we hover over something that doesn't have data-tooltip,
      // hide the tooltip
      tooltip.style.display = 'none';
      tooltipContent.innerHTML = '';
    }
  });

  // Also update tooltip position on mousemove if desired
  document.addEventListener('mousemove', function (e) {
    if (tooltip.style.display === 'block') {
      tooltip.style.left = (e.pageX + 15) + 'px';
      tooltip.style.top = (e.pageY + 15) + 'px';
    }
  });
    
});

function formatLastLogin(dateString) {
    const date = new Date(dateString);
    const now = new Date();

    const diffInMs = now - date;
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
        return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffInDays === 1) {
        return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffInDays < 7) {
        return `${diffInDays} days ago at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    }
}

function sortAlts(property, direction) {
    alts.sort(function(a, b) {
        let valA = a[property];
        let valB = b[property];

        if (property === 'last_login') {
            // Convert the date strings to timestamps
            valA = Date.parse(valA);
            valB = Date.parse(valB);
        } else {
            // Normalize strings
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            // Convert to number if it's a numeric field
            if (property === 'achievement_points' || property === 'average_item_level' || property === 'gold' || property === 'level') {
                valA = Number(valA);
                valB = Number(valB);
            }
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;

        // Secondary comparison by name
        if (property !== 'name' && property !== 'last_login') {
            let nameA = a.name.toLowerCase();
            let nameB = b.name.toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
        }

        return 0;
    });

    if (currentView === 'cards') {
        renderCardView();
    } else {
        renderTableView();
    }
}

function renderCardView() {
    $('#alts').empty();
    $('#alts').css('display', 'none'); // reset layout

    // var card = $(createSummaryCard(summary));
    // $(card).appendTo('#alts');

    $.each(alts, function(i, alt) {
        var card = $(createCard(alt));
        $(card).appendTo('#alts');
    });

    // Set display to grid for card layout (adjust if your CSS expects another layout)
    $('#alts').css('display', 'grid');
    $('#alts').fadeIn(1000);
    $('#alts > article').show();
}

function renderTableView() {
    $('#alts').empty();
    $('#alts').css('display', 'none');

    var table = `
    <table id="alts-table">
        <thead>
            <tr>
                <th data-sort-property="name">Name</th>
                <th data-sort-property="realm">Realm</th>
                <th data-sort-property="gender">Gender</th>
                <th data-sort-property="race">Race</th>
                <th data-sort-property="class">Class</th>
                <th data-sort-property="spec">Spec</th>
                <th data-sort-property="level">Level</th>
                <th data-sort-property="achievement_points">Achievement Points</th>
                <th data-sort-property="average_item_level">Item Level</th>
                <th data-sort-property="gold">Gold</th>
                <th data-sort-property="location">Location</th>
                <th data-sort-property="last_login">Last Login</th>
            </tr>
        </thead>
        <tbody></tbody>
    </table>`;

    $('#alts').append(table);

    $.each(alts, function(i, alt) {
        let altClass = alt.class.toLowerCase().replace(' ', '');
        let altSpec = '';
        if ('spec' in alt) {
            altSpec = alt.spec.toLowerCase().replace(' ', '');
        }
        let altFaction = alt.faction.toLowerCase();
        let altMoney = '';
        if (alt.gold > 0) {
            altMoney += `<span class="gold">${ Intl.NumberFormat().format(alt.gold) }</span>`;
        } 
        if (alt.silver > 0) {
            altMoney += `<span class="silver">${ alt.silver }</span>`;
        } 
        if (alt.copper > 0) {
            altMoney += `<span class="copper">${ alt.copper }</span>`;
        } 
            let formattedLastLogin = formatLastLogin(alt.last_login);
        if (formattedLastLogin == 'Invalid Date') {
            formattedLastLogin = '';
        }
        $('#alts-table tbody').append(`
            <tr class="${altFaction}">
                <td class="${altClass} view-alt-details" data-alt-name="${alt.name}" data-alt-realm="${alt.realm}">${alt.name}</td>
                <td>${alt.realm}</td>
                <td>${alt.gender}</td>
                <td>${alt.race}</td>
                <td class="${altClass}">${alt.class}</td>
                <td class="${altSpec}">${altSpec}</td>
                <td>${alt.level}</td>
                <td>${alt.achievement_points}</td>
                <td>${alt.average_item_level}</td>
                <td class="money">${ altMoney }</td>
                <td>${alt.location}</td>
                <td>${formattedLastLogin}</td>
            </tr>
        `);
    });

    // Click handler for sorting columns
    $('#alts-table thead th').off('click').on('click', function() {
        var property = $(this).data('sort-property');
        if (property === lastSortedColumn) {
            lastSortDirection = (lastSortDirection === 'asc') ? 'desc' : 'asc';
        } else {
            lastSortedColumn = property;
            lastSortDirection = 'asc';
        }
        sortAlts(property, lastSortDirection);
    });

    // Remove old indicators
    $('#alts-table thead th').each(function(){
        var text = $(this).text();
        $(this).html(text); // resets to just the original text
    });

    // Add Font Awesome icon to the currently sorted column
    if (lastSortedColumn) {
        var sortedTh = $('#alts-table thead th[data-sort-property="' + lastSortedColumn + '"]');
        if (sortedTh.length) {
            // Choose icon based on direction
            var icon = (lastSortDirection === 'asc') ? '<i class="fa-solid fa-arrow-up"></i>' : '<i class="fa-solid fa-arrow-down"></i>';
            // Append icon to the existing header text
            var currentText = sortedTh.text();
            sortedTh.html(currentText + ' ' + icon);
        }
    }

    $('#alts').css('display', 'block').fadeIn(1000);
}

function createCard(alt) {
    let altBg = '';
    if (alt.main_image) {
        altBg = `style="background-image: url('${alt.main_image}')"`;
    }
    let altClass = alt.class.toLowerCase().replace(' ', '');
    let altFaction = alt.faction.toLowerCase();
    let altLevel = '';
    if (alt.level < 80) {
        altLevel = `<p class="card-text level-icon ${altClass} ${altClass}-border">${ alt.level }</p>`;
    }
    altLocation = alt.location
    if (altLocation == '') {
        altLocation = 'unknown';
    }
    let formattedLastLogin = formatLastLogin(alt.last_login);
    if (formattedLastLogin == 'Invalid Date') {
        formattedLastLogin = '';
    }

    let altMoney = '';
    if (alt.gold > 0) {
        altMoney += `<span class="gold">${ Intl.NumberFormat().format(alt.gold) }</span>`;
    } 
    if (alt.silver > 0) {
        altMoney += `<span class="silver">${ alt.silver }</span>`;
    } 
    if (alt.copper > 0) {
        altMoney += `<span class="copper">${ alt.copper }</span>`;
    } 

    let card = `
    <article class="alt card ${altClass} ${altFaction} view-alt-details" data-alt-name="${alt.name}" data-alt-realm="${alt.realm}" ${altBg})">    
        <div class="card-body">
            <h1 class="card-title ${altClass}">${ alt.name }</h1>
            <dl>
                <dt>Realm</dt>
                <dd>${ alt.realm }</dd>
                <dt>Gender Race</dt>
                <dd>${ alt.gender } ${ alt.race }</dd>
                <dt>Spec</dt>
                <dd>${ alt.spec }</dd>
                <dt>Class</dt>
                <dd>${ alt.class }</dd>
                <dt>Achievement Points</dt>
                <dd>${ alt.achievement_points }</dd>
                <dt>Average Item Level</dt>
                <dd>${ alt.average_item_level }</dd>
            </dl>
            <dl>
                <dt>Gold</dt>
                <dd class="money">${ altMoney }</dd>
                <dt>Location</dt>
                <dd>${ altLocation }</dd>
            </dl>
    `;

    if (alt.professions.length > 0) {
        card += `<dl class="professions">`;
        $.each(alt.professions, function(i, profession) {
            let progress = (profession.skill_points / profession.max_skill_points) * 100;
            card += `
                <dt>Professions</dt>
                <dd>${ profession.name }<div class="progress-bar bottom"><span class="progress" style="width: ${ progress }%"></span></div></dd>
            `;
        });
        card += `</dl>`;
    }

    card += `
            <div class="card-footer">
                <p class="alt-id">${ alt.character_id }</p>
                <p class="last-login">${formattedLastLogin}</p>
            </div>
            <div class="alt-icons">
                <img class="icon faction-icon ${altFaction}-icon" data-filter="${altFaction}" src="/static/images/${altFaction}.png" alt="${alt.faction} icon">
                <img class="icon class-icon" data-filter="${altClass}" src="/static/flatborder/${altClass}_flatborder.png" alt="${alt.class} icon">
                ${altLevel}
            </div>
        </div>
    </article>
    `;
    return card;
}

function createSummaryCard(summary) {
    let card = `
    <article class="alt card summary">    
        <div class="card-body">
            <h1 class="card-title summary">Summary</h1>
            <dl>
                <dt>Battletag</dt>
                <dd class="card-text realm">${ summary.battletag }</dd>
                <dt>Number of accounts</dt>
                <dd class="card-text realm">${ summary.accounts }</dd>
                <dt>Number of alts</dt>
                <dd class="card-text realm">${ summary.number_alts }</dd>
                <dt>Total Gold</dt>
                <dd class="money"><span class="gold">${ Intl.NumberFormat().format(summary.gold) }</span> <span class="silver">${ summary.silver }</span> <span class="copper">${ summary.copper }</span></dd>
            </dl>
        </div>
    </article>
    `;
    return card;
}

$("a[href='#top']").click(function() {
    $('html, body').animate({ scrollTop: 0 }, 1200);
    return false;
});

function fadeInAndOutRandom($img) {
    // 1) Random time to remain faded (1..3 seconds, e.g.)
    const fadeOutDuration = Math.random() * 2 + 1; 
    // 2) Random wait before next fade cycle (2..6 seconds)
    const nextInterval = Math.random() * 5 + 5;
  
    // Fade out by adding 'faded' class
    $img.addClass('faded');
  
    // After fadeOutDuration, fade back in
    setTimeout(() => {
      $img.removeClass('faded');
    }, fadeOutDuration * 1000);
  
    // Then after fadeOutDuration + nextInterval, run again
    setTimeout(() => {
      fadeInAndOutRandom($img);
    }, (fadeOutDuration + nextInterval) * 1000);
  }

  const animateCSS = (element, animation, prefix = 'animate__') =>
    // We create a Promise and return it
    new Promise((resolve, reject) => {
      const animationName = `${prefix}${animation}`;
      const node = document.querySelector(element);
  
      node.classList.add(`${prefix}animated`, animationName);
  
      // When the animation ends, we clean the classes and resolve the Promise
      function handleAnimationEnd(event) {
        event.stopPropagation();
        node.classList.remove(`${prefix}animated`, animationName);
        resolve('Animation ended');
      }
  
      node.addEventListener('animationend', handleAnimationEnd, {once: true});
});

const classParticleConfigs = {
    // For Death Knight, a “snow” effect
    deathknight: {
      fullScreen: { enable: false },
      background: { color: "transparent" },
      particles: {
        number: { value: 100 },
        color: { value: "#dddddd" },
        shape: { type: "circle" },
        opacity: { value: 0.4 },
        size: {
          value: 3,
          random: { enable: true, minimumValue: 1 }
        },
        move: {
          enable: true,
          direction: "bottom",
          speed: 1,
          outModes: { default: "out" }
        }
      }
    },
  
    // For Druid, a leaf effect (image shapes)
    druid: {
      fullScreen: { enable: false },
      background: { color: "transparent" },
      particles: {
        number: { value: 50 },
        shape: {
          type: "image",
          image: [
            { src: "/static/images/leaves/leaf-1.png", width: 86, height: 121 },
            { src: "/static/images/leaves/leaf-2.png", width: 61, height: 121 },
            { src: "/static/images/leaves/leaf-3.png", width: 73, height: 120 },
            { src: "/static/images/leaves/leaf-4.png", width: 104, height: 112 },
            { src: "/static/images/leaves/leaf-5.png", width: 88, height: 132 },
            { src: "/static/images/leaves/leaf-6.png", width: 125, height: 121 },
            { src: "/static/images/leaves/leaf-7.png", width: 72, height: 156 },
            { src: "/static/images/leaves/leaf-8.png", width: 55, height: 137 },
            { src: "/static/images/leaves/leaf-9.png", width: 88, height: 124 },
            { src: "/static/images/leaves/leaf-10.png", width: 64, height: 108 },
            { src: "/static/images/leaves/leaf-11.png", width: 75, height: 126 },
            { src: "/static/images/leaves/leaf-12.png", width: 51, height: 142 }
          ]
        },
        opacity: { value: 0.8 },
        size: { value: 5, random: true },
        move: {
          enable: true,
          speed: 1,
          direction: "none",
          random: true,
          outModes: { default: "out" }
        }
      }
    },
    paladin: {
    // Fullscreen disabled so it stays in your container
    fullScreen: { enable: false },
    background: { color: "transparent" },

    // No default particles, rely on an emitter
    particles: {
        number: { value: 0 }
    },

    // Use the emitters plugin
    emitters: [
        {
        // Position at 50% across, 20% down, in percentage mode
        position: { x: 50, y: 60, mode: "percent" },

        size: { width: 0, height: 0 },
        rate: {
            quantity: 1, // spawn exactly one particle
            delay: 0     // immediately
        },

        particles: {
            // Shape: single image
            shape: {
            type: "image",
            image: {
                // path to your PNG
                src: "/static/images/paladin-bubble.png",
                width: 1000,   // actual image width in px
                height: 1000   // actual image height in px
            }
            },

            // Adjust the drawn size of the orb in px
            size: {
            value: 300
            },

            // If you want transparency, set an opacity
            opacity: { value: 0.05 },

            // Keep it stationary
            move: {
            enable: true,
            speed: 0,
            outModes: { default: "none" }
            },

            // Optional: add slow rotation
            rotate: {
            animation: {
                enable: true,
                speed: 2
            }
            }
        }
        }
    ]
    },

    demonhunter: {
        fullScreen: { enable: false },
        background: { color: "transparent" },

        particles: {
            // Enough particles to make it visually dynamic
            number: {
            value: 50,
            density: {
                enable: true,
                value_area: 800
            }
            },
            // Bright green color for Demon Hunter vibe
            color: {
            value: "#00FF00"
            },
            // Optionally "circle", "star", or "polygon" for a trailing shape
            shape: { type: "polygon" },
            opacity: {
            value: 0.7 // slightly transparent
            },
            // Each “meteor” size can vary
            size: {
            value: 5,
            random: true
            },
            move: {
            enable: true,
            // Speed up the streaks to 4 or 5 to simulate meteor fast movement
            speed: 5,
            // “direction: top” means they move upward.
            // If you want them showering downward, set direction: "bottom".
            direction: "top-right",
            random: true,  // Set to true if you want them at varying angles
            straight: true, // false => they can slightly deviate from straight lines
            // Particles exiting the container are removed
            outModes: {
                default: "out"
            }
            }
        }
        },
    hunter: {
    // Not filling the entire screen, just the container
    fullScreen: { enable: false },
    background: { color: "transparent" },

    // No default base particles
    particles: {
        number: { value: 0 }
    },

    emitters: [
        // Emitter on the left side, shooting arrows rightward
        {
        position: { x: 0, y: 0, mode: "percent" }, 
        size: { width: 0, height: 100 },
        rate: {
            quantity: 1, // how many arrows at once
            delay: { min: 1, max: 4 }
        },
        // Force direction "right" so arrows go horizontally across the container
        direction: "right",
        particles: {
            shape: {
            type: "image",
            image: {
                // path to your arrow image
                src: "/static/images/arrow.png",
                width: 400,
                height: 24
            }
            },
            size: { value: 60 },        // scale the arrow
            opacity: { value: 1 },      // fully opaque or adjust for slight transparency
            move: {
            enable: true,
            speed: { min: 10, max: 30 }, // random speed between 3 and 8            random: false,   // don't randomize angles
            straight: true,  // move in a single straight line
            outModes: {
                default: "none"         // arrow disappears off the right edge
            }
            }
        }
        },

        // Emitter on the right side, shooting arrows leftward
        {
        position: { x: 100, y: 0, mode: "percent" },
        size: { width: 0, height: 100 },
        rate: {
            quantity: 1, 
            delay: { min: 1, max: 3 }
        },
        direction: "left", // or you can manually set an angle if you prefer
        particles: {
            shape: {
            type: "image",
            image: [
                {
                  src: "/static/images/arrow.png",
                  width: 400,
                  height: 24
                },
                {
                  src: "/static/images/arrow-2.png",
                  width: 400,
                  height: 43
                }
              ]            },
            size: { value: 60 },
            opacity: { value: 1 },
            move: {
            enable: true,
            speed: 20,
            random: false,   // don't randomize angles
            straight: true,  // move in a single straight line
            outModes: {
                default: "none"
            }
            },
            rotate: {
            value: 180, // rotate 180 so arrow points left
            animation: { enable: false }
            }
        }
        }
    ]
    }        
  };
